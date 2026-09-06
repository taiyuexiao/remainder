import { db } from './connection.js';
import { stripToText } from '../services/docSearch.js';

/**
 * 建表迁移。当前为初版 schema（v1），后续版本用 user_version 递增迁移。
 * 与 docs/TECH.md 第 4 节保持一致。
 */
export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('main','side','follow','idea')),
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done','archived')),
      priority INTEGER DEFAULT 2,
      ddl TEXT,
      milestone TEXT,
      tags TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      done_at TEXT,
      reminded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS follow_ups (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      person TEXT NOT NULL,
      next_follow_date TEXT NOT NULL,
      urge_count INTEGER DEFAULT 0,
      last_urged_at TEXT
    );

    CREATE TABLE IF NOT EXISTS inbox (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      converted_task_id TEXT
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_ddl ON tasks(ddl);
    CREATE INDEX IF NOT EXISTS idx_follow_next ON follow_ups(next_follow_date);
  `);

  // v1.1: 提醒时间戳（M6）
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN reminded_at TEXT;`);
  } catch {
    // column already exists
  }

  // v2: 项目文件夹模型（M10）——main/side/follow 任务迁移为 projects，tasks 只剩子任务+想法
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version < 2) migrateToV2();

  // v3: 网页剪藏箱（M11.1）
  if ((db.pragma('user_version', { simple: true }) as number) < 3) migrateToV3();

  // v4: 知识库升级——documents 元数据 + FTS5 trigram 全文搜索（M11.4）
  if ((db.pragma('user_version', { simple: true }) as number) < 4) migrateToV4();

  // v5: 文档文件夹系统（M12）
  if ((db.pragma('user_version', { simple: true }) as number) < 5) migrateToV5();

  // v6: 主栏目支持文档+文件夹混排，移出 default 文件夹
  if ((db.pragma('user_version', { simple: true }) as number) < 6) migrateToV6();

  // v7: 报告系统（日报/周报/月报 + 任务概览）
  if ((db.pragma('user_version', { simple: true }) as number) < 7) migrateToV7();

  // v8: 调研画布
  if ((db.pragma('user_version', { simple: true }) as number) < 8) migrateToV8();

  // v9: 报告唯一约束（同一类型同一日期一条）
  if ((db.pragma('user_version', { simple: true }) as number) < 9) migrateToV9();

  // v10: AI 助手会话（M19）
  if ((db.pragma('user_version', { simple: true }) as number) < 10) migrateToV10();

  // v11: 团队知识库条目（M23）
  if ((db.pragma('user_version', { simple: true }) as number) < 11) migrateToV11();

  // v12: 多团队空间（M24）
  if ((db.pragma('user_version', { simple: true }) as number) < 12) migrateToV12();

  // v13: 工作库项目化（M25 / K2）
  if ((db.pragma('user_version', { simple: true }) as number) < 13) migrateToV13();

  // v14: 条目评论（M26 / K3）
  if ((db.pragma('user_version', { simple: true }) as number) < 14) migrateToV14();

  // v15: 发布/同步（M27 / K4）
  if ((db.pragma('user_version', { simple: true }) as number) < 15) migrateToV15();
}

/**
 * v2 迁移（幂等，由 user_version 把关）：
 * 1. 建 projects 表，把 main/side/follow 任务原样迁入（保留原 id）
 * 2. 重建 follow_ups：FK 从 tasks(id) 改指 projects(id)。必须先拷贝再删 tasks 行，
 *    否则旧 FK 的 ON DELETE CASCADE 会把 follow_ups 数据级联删掉
 * 3. 删除 tasks 中已迁移的三类行，tasks 增加 project_id 列（子任务归属）
 */
function migrateToV2() {
  db.pragma('foreign_keys = OFF');
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('main','side','follow')),
        status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done','archived')),
        priority INTEGER DEFAULT 2,
        ddl TEXT,
        milestone TEXT,
        tags TEXT DEFAULT '',
        note TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        done_at TEXT
      );
    `);
    db.exec(`
      INSERT INTO projects (id,name,type,status,priority,ddl,milestone,tags,note,created_at,updated_at,done_at)
      SELECT id,title,type,status,priority,ddl,milestone,tags,note,created_at,updated_at,done_at
      FROM tasks WHERE type IN ('main','side','follow');
    `);
    db.exec(`
      CREATE TABLE follow_ups_new (
        task_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        person TEXT NOT NULL,
        next_follow_date TEXT NOT NULL,
        urge_count INTEGER DEFAULT 0,
        last_urged_at TEXT
      );
      INSERT INTO follow_ups_new SELECT * FROM follow_ups;
      DROP TABLE follow_ups;
      ALTER TABLE follow_ups_new RENAME TO follow_ups;
      DELETE FROM tasks WHERE type IN ('main','side','follow');
    `);
    const cols = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[];
    if (!cols.some((c) => c.name === 'project_id')) {
      db.exec('ALTER TABLE tasks ADD COLUMN project_id TEXT');
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_follow_next ON follow_ups(next_follow_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type, status);
    `);
  });
  tx();
  db.pragma('foreign_keys = ON');
  db.pragma('user_version = 2');
}

/** v3 迁移（幂等，由 user_version 把关）：clips 剪藏箱表（M11.1） */
function migrateToV3() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clips (
      id TEXT PRIMARY KEY,
      url TEXT DEFAULT '',
      title TEXT NOT NULL,
      content_html TEXT NOT NULL,       -- 清洗+图片本地化后的正文
      excerpt TEXT DEFAULT '',
      source TEXT DEFAULT 'extension',  -- extension | clipboard
      status TEXT DEFAULT 'inbox' CHECK(status IN ('inbox','converted')),
      converted_doc_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_clips_status ON clips(status, created_at);
  `);
  db.pragma('user_version = 3');
}

/**
 * v4 迁移（幂等，由 user_version 把关）：知识库升级（M11.4）
 * 1. documents 加元数据列 source_url/tags/summary/clip_id，加 content_text 实列（正文纯文本，应用层维护）
 * 2. docs_fts：FTS5 external content（trigram 分词支持 CJK），索引 docs 的 title/content_text/tags
 * 3. 存量回填 content_text 后 rebuild 索引
 */
function migrateToV4() {
  const cols = db.prepare('PRAGMA table_info(documents)').all() as { name: string }[];
  const addCol = (name: string, ddl: string) => {
    if (!cols.some((c) => c.name === name)) db.exec(`ALTER TABLE documents ADD COLUMN ${ddl}`);
  };
  addCol('source_url', `source_url TEXT DEFAULT ''`);
  addCol('tags', `tags TEXT DEFAULT ''`);
  addCol('summary', `summary TEXT DEFAULT ''`);
  addCol('clip_id', 'clip_id TEXT');
  addCol('content_text', `content_text TEXT DEFAULT ''`);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
      title, content_text, tags,
      content='documents', content_rowid='rowid',
      tokenize='trigram'
    );
  `);

  // 存量回填纯文本
  const rows = db.prepare('SELECT rowid, content FROM documents').all() as { rowid: number; content: string }[];
  const upd = db.prepare('UPDATE documents SET content_text = ? WHERE rowid = ?');
  for (const r of rows) upd.run(stripToText(r.content), r.rowid);
  db.exec(`INSERT INTO docs_fts(docs_fts) VALUES('rebuild')`);

  db.pragma('user_version = 4');
}

/** v5 迁移（M12）：文档文件夹系统 */
function migrateToV5() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS doc_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES doc_folders(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_doc_folders_parent ON doc_folders(parent_id);
  `);

  const cols = db.prepare('PRAGMA table_info(documents)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'folder_id')) {
    db.exec('ALTER TABLE documents ADD COLUMN folder_id TEXT REFERENCES doc_folders(id) ON DELETE SET NULL');
  }

  const ts = new Date().toISOString();
  // 默认根文件夹，存放所有历史未分类文档
  db.prepare(
    `INSERT OR IGNORE INTO doc_folders (id, name, parent_id, sort_order, created_at, updated_at)
     VALUES (?, ?, NULL, 0, ?, ?)`,
  ).run('default', '默认文件夹', ts, ts);

  // 把现有文档全部归入默认文件夹
  db.prepare('UPDATE documents SET folder_id = ? WHERE folder_id IS NULL').run('default');

  db.pragma('user_version = 5');
}

/** v6 迁移：文档从 default 文件夹移出到根级，删除 default 文件夹 */
function migrateToV6() {
  const defaultFolder = db.prepare('SELECT id FROM doc_folders WHERE id = ?').get('default') as
    | { id: string }
    | undefined;
  if (defaultFolder) {
    db.prepare('UPDATE documents SET folder_id = NULL WHERE folder_id = ?').run('default');
    db.prepare('DELETE FROM doc_folders WHERE id = ?').run('default');
  }
  db.pragma('user_version = 6');
}

/** v7 迁移：报告系统 */
function migrateToV7() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('daily','weekly','monthly')),
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reports_type_date ON reports(type, date DESC);
  `);
  db.pragma('user_version = 7');
}

/** v8 迁移：调研画布 */
function migrateToV8() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS canvas_items (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES canvas_boards(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('text','image','clip')),
      x REAL NOT NULL,
      y REAL NOT NULL,
      w REAL DEFAULT 240,
      h REAL DEFAULT 160,
      content TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_canvas_items_board ON canvas_items(board_id);
  `);
  db.pragma('user_version = 8');
}

/** v9 迁移：报告同一类型同一日期唯一，补 updated_at 列 */
function migrateToV9() {
  const cols = db.prepare('PRAGMA table_info(reports)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'updated_at')) {
    db.exec(`ALTER TABLE reports ADD COLUMN updated_at TEXT`);
    db.exec(`UPDATE reports SET updated_at = created_at WHERE updated_at IS NULL`);
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_type_date ON reports(type, date);`);
  db.pragma('user_version = 9');
}
/** v10 迁移（M19）：AI 助手会话 */
function migrateToV10() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conv_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      actions TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conv_id, created_at);
  `);
  db.pragma('user_version = 10');
}
/** v11 迁移（M23）：团队知识库条目 */
function migrateToV11() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('intel','share','note','rfc','guide','spec','adr')),
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      content_text TEXT DEFAULT '',
      author TEXT DEFAULT '',
      owners TEXT DEFAULT '[]',
      channels TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      ttl TEXT DEFAULT '',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','archived','draft','open','concluded')),
      acl TEXT DEFAULT 'team' CHECK(acl IN ('team','project','private')),
      notify TEXT DEFAULT 'digest' CHECK(notify IN ('immediate','digest','silent')),
      related TEXT DEFAULT '[]',
      conclusion TEXT DEFAULT '',
      useful_count INTEGER DEFAULT 0,
      source_url TEXT DEFAULT '',
      source_clip_id TEXT,
      source_doc_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge_items(type, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_knowledge_expires ON knowledge_items(expires_at);

    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
      title, content_text, tags,
      content='knowledge_items', content_rowid='rowid',
      tokenize='trigram'
    );
  `);
  db.pragma('user_version = 11');
}

/**
 * v12 迁移（M24）：多团队空间。
 * 1. teams / team_members 表（角色 owner/admin/member）
 * 2. knowledge_items 加 team_id 列，存量归入内置「个人空间」(team_id='personal')
 * 3. 个人空间为特殊团队：节点上所有用户默认可访问（单机场景零配置）
 */
function migrateToV12() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      invite_token TEXT NOT NULL,
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','member')),
      joined_at TEXT NOT NULL,
      PRIMARY KEY (team_id, user_name)
    );
  `);

  const cols = db.prepare('PRAGMA table_info(knowledge_items)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'team_id')) {
    db.exec(`ALTER TABLE knowledge_items ADD COLUMN team_id TEXT NOT NULL DEFAULT 'personal'`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_knowledge_team ON knowledge_items(team_id, type, status)`);

  // 内置个人空间（幂等）
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO teams (id, name, description, invite_token, created_by, created_at)
     VALUES ('personal', '个人空间', '本机个人知识资产', '', 'system', ?)`,
  ).run(ts);

  db.pragma('user_version = 12');
}

/**
 * v13 迁移（M25 / K2）：工作库项目化。
 * kb_projects：项目→子项目（parent_id 自嵌套）树，挂 team_id 隔离；owners=JSON 数组（@负责人）
 * knowledge_items 加 project_id（可空=未分配到项目）
 */
function migrateToV13() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_projects (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL DEFAULT 'personal',
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      parent_id TEXT REFERENCES kb_projects(id) ON DELETE CASCADE,
      owners TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kb_projects_team ON kb_projects(team_id, parent_id);
  `);
  const cols = db.prepare('PRAGMA table_info(knowledge_items)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'project_id')) {
    db.exec(`ALTER TABLE knowledge_items ADD COLUMN project_id TEXT`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_knowledge_project ON knowledge_items(project_id)`);
  db.pragma('user_version = 13');
}

/** v14 迁移（M26 / K3）：条目评论流，parent_id 支持楼中楼 */
function migrateToV14() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_item ON comments(item_id, created_at);
  `);
  db.pragma('user_version = 14');
}

/**
 * v15 迁移（M27 / K4）：发布/同步。
 * publications：发布记录（from_team → to_team，进对方收件箱，三选：查看/同步/忽略）
 * knowledge_items 加 upstream_*：同步副本记上游指针（fork 式；上游删除不回删副本——红线）
 */
function migrateToV15() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS publications (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
      from_team TEXT NOT NULL,
      to_team TEXT NOT NULL,
      from_author TEXT DEFAULT '',
      source_updated_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','viewed','synced','ignored')),
      synced_item_id TEXT,
      resolved_by TEXT DEFAULT '',
      published_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_publications_to ON publications(to_team, status);
    CREATE INDEX IF NOT EXISTS idx_publications_item ON publications(item_id);
  `);
  const cols = db.prepare('PRAGMA table_info(knowledge_items)').all() as { name: string }[];
  const addCol = (name: string, ddl: string) => {
    if (!cols.some((c) => c.name === name)) db.exec(`ALTER TABLE knowledge_items ADD COLUMN ${ddl}`);
  };
  addCol('upstream_id', 'upstream_id TEXT');
  addCol('upstream_team', `upstream_team TEXT DEFAULT ''`);
  addCol('upstream_updated_at', 'upstream_updated_at TEXT');
  db.pragma('user_version = 15');
}