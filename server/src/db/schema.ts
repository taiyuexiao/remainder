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
