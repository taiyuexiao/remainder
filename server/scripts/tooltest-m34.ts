/**
 * M34 tool-level e2e: A3 new tools + executeAgentUndo (deterministic, no LLM).
 * Run: pnpm exec tsx scripts/tooltest-m34.ts   (from server/)
 * Uses real data/remainder.db; all test rows are marked ZZT34 and cleaned up.
 */
import { db } from '../src/db/connection.js';
import { executeTool, executeAgentUndo } from '../src/llm/agentTools.js';
import { now, uuid } from '../src/routes/helpers.js';

let failed = 0;
function check(name: string, ok: boolean, extra = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' -- ' + extra : ''}`);
}

function lastUndo(r: { undo?: { table: string; id: string; before: Record<string, unknown> | null } }) {
  if (!r.undo) throw new Error('no undo info');
  return {
    tool: '',
    undo_table: r.undo.table,
    undo_id: r.undo.id,
    before_json: r.undo.before ? JSON.stringify(r.undo.before) : null,
  };
}

const ts = now();
const clipId = uuid();
const followProjId = uuid();
const openDocId = uuid();

try {
  // ---- kb_create + undo ----
  const c1 = await executeTool('kb_create', { title: 'ZZT34 kb item', content: 'hello kb', type: 'note' });
  check('kb_create', c1.result.includes('已创建'), c1.result);
  const kbId = c1.undo!.id;
  check('kb row exists', !!db.prepare('SELECT id FROM knowledge_items WHERE id = ?').get(kbId));
  executeAgentUndo({ ...lastUndo(c1), tool: 'kb_create' });
  check('kb_create undo deletes row', !db.prepare('SELECT id FROM knowledge_items WHERE id = ?').get(kbId));

  // ---- kb_create + kb_update(append) + undo restore ----
  const c2 = await executeTool('kb_create', { title: 'ZZT34 kb upd', content: 'v1', type: 'note' });
  const kb2 = c2.undo!.id;
  const u2 = await executeTool('kb_update', { match: 'ZZT34 kb upd', content: 'v2 more', append: true });
  check('kb_update append', u2.result.includes('已更新'), u2.result);
  const afterUpd = db.prepare('SELECT content FROM knowledge_items WHERE id = ?').get(kb2) as { content: string };
  check('kb content appended', afterUpd.content.includes('v2 more'), afterUpd.content);
  executeAgentUndo({ ...lastUndo(u2), tool: 'kb_update' });
  const restored = db.prepare('SELECT content FROM knowledge_items WHERE id = ?').get(kb2) as { content: string };
  check('kb_update undo restores content', restored.content === 'v1', restored.content);

  // ---- kb_search ----
  const s = await executeTool('kb_search', { q: 'ZZT34 kb upd' });
  check('kb_search finds item', s.result.includes('ZZT34 kb upd'), s.result);

  // ---- convert_clip + composite undo ----
  db.prepare(`INSERT INTO clips (id,url,title,content_html,excerpt,source,status,created_at) VALUES (?,?,?,?,?, 'extension','inbox',?)`)
    .run(clipId, 'http://x', 'ZZT34 clip', '<p>clip body</p>', 'excerpt', ts);
  const cc = await executeTool('convert_clip', { match: 'ZZT34 clip' });
  check('convert_clip', cc.result.includes('已转为文档'), cc.result);
  check('convert_clip clientAction=open_doc', cc.clientAction?.type === 'open_doc');
  const convDocId = cc.undo!.id;
  check('clip converted', (db.prepare('SELECT status FROM clips WHERE id = ?').get(clipId) as { status: string }).status === 'converted');
  executeAgentUndo({ ...lastUndo(cc), tool: 'convert_clip' });
  check('convert_clip undo deletes doc', !db.prepare('SELECT id FROM documents WHERE id = ?').get(convDocId));
  check('convert_clip undo reverts clip', (db.prepare('SELECT status FROM clips WHERE id = ?').get(clipId) as { status: string }).status === 'inbox');

  // ---- clip_to_knowledge + undo ----
  const ck = await executeTool('clip_to_knowledge', { match: 'ZZT34 clip' });
  check('clip_to_knowledge', ck.result.includes('已沉淀'), ck.result);
  executeAgentUndo({ ...lastUndo(ck), tool: 'clip_to_knowledge' });
  check('clip_to_knowledge undo', !db.prepare('SELECT id FROM knowledge_items WHERE id = ?').get(ck.undo!.id));

  // ---- generate_report(daily) + undo ----
  const gr = await executeTool('generate_report', { type: 'daily' });
  check('generate_report daily', gr.result.includes('日报'), gr.result);
  check('generate_report clientAction=nav reports', gr.clientAction?.type === 'nav' && gr.clientAction.page === 'reports');
  if (gr.undo) {
    executeAgentUndo({ ...lastUndo(gr), tool: 'generate_report' });
    check('generate_report undo deletes row', !db.prepare('SELECT id FROM reports WHERE id = ?').get(gr.undo.id));
  }

  // ---- urge_follow + special undo ----
  db.prepare(`INSERT INTO projects (id,name,type,status,priority,created_at,updated_at) VALUES (?,'ZZT34 follow','follow','todo',2,?,?)`)
    .run(followProjId, ts, ts);
  db.prepare('INSERT INTO follow_ups (task_id, person, next_follow_date, urge_count) VALUES (?,?,?,0)')
    .run(followProjId, 'ZZT34person', '2099-01-01');
  const uf = await executeTool('urge_follow', { match: 'ZZT34person' });
  check('urge_follow', uf.result.includes('已催办'), uf.result);
  check('urge_count=1', (db.prepare('SELECT urge_count FROM follow_ups WHERE task_id = ?').get(followProjId) as { urge_count: number }).urge_count === 1);
  executeAgentUndo({ ...lastUndo(uf), tool: 'urge_follow' });
  check('urge_follow undo restores count', (db.prepare('SELECT urge_count FROM follow_ups WHERE task_id = ?').get(followProjId) as { urge_count: number }).urge_count === 0);

  // ---- open_document / navigate_to client actions ----
  db.prepare(`INSERT INTO documents (id,title,content,created_at,updated_at) VALUES (?,'ZZT34 open me','{}',?,?)`).run(openDocId, ts, ts);
  const od = await executeTool('open_document', { id: openDocId });
  check('open_document clientAction', od.clientAction?.type === 'open_doc' && od.clientAction.docId === openDocId, od.result);
  const nv = await executeTool('navigate_to', { page: 'knowledge' });
  check('navigate_to clientAction', nv.clientAction?.type === 'nav' && nv.clientAction.page === 'knowledge', nv.result);

  // ---- kb_publish error paths (no real team to publish to in personal-only db) ----
  const kp = await executeTool('kb_publish', { match: 'ZZT34 kb upd', team: 'ZZT34-no-such-team' });
  check('kb_publish reports missing team', kp.result.includes('未找到团队'), kp.result);
} finally {
  // cleanup
  db.prepare("DELETE FROM knowledge_items WHERE title LIKE 'ZZT34%'").run();
  db.prepare("DELETE FROM clips WHERE title LIKE 'ZZT34%'").run();
  db.prepare("DELETE FROM documents WHERE title LIKE 'ZZT34%'").run();
  db.prepare("DELETE FROM projects WHERE name LIKE 'ZZT34%'").run();
  db.prepare('DELETE FROM follow_ups WHERE task_id = ?').run(followProjId);
  console.log('cleanup done');
}
process.exit(failed ? 1 : 0);
