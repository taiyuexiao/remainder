import { db } from '../db/connection.js';

/**
 * 文档全文搜索（M11.4）：FTS5 trigram（external content 关联 documents.rowid）。
 * - q 长度 >= 3 → FTS MATCH（trigram 原生支持 CJK）
 * - q 长度 < 3  → LIKE 兜底
 * 索引同步：external content 模式下单行 delete 需携带旧值，极易踩坑；
 * 个人知识库数据量小，任何文档变更后直接全量 rebuild（微秒级），KISS 且绝对一致。
 */

/** 正文 → 纯文本：Tiptap JSON 走 text 节点遍历，HTML 剥标签 */
export function stripToText(content: string): string {
  const s = (content ?? '').trim();
  if (!s) return '';
  if (s.startsWith('{')) {
    try {
      const texts: string[] = [];
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node && typeof node === 'object') {
          const n = node as Record<string, unknown>;
          if (typeof n.text === 'string') texts.push(n.text);
          if (n.content) walk(n.content);
        }
      };
      walk(JSON.parse(s));
      return texts.join(' ').replace(/\s+/g, ' ').trim();
    } catch {
      /* 非 JSON 走剥标签 */
    }
  }
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 全量重建索引（文档增删改 / 剪藏转入后调用） */
export function rebuildDocsFts(): void {
  db.exec(`INSERT INTO docs_fts(docs_fts) VALUES('rebuild')`);
}

const LIST_COLS = 'd.id, d.title, d.tags, d.source_url, d.summary, d.clip_id, d.created_at, d.updated_at';

/** 搜索：返回轻行（无 content），FTS 路径带 rank */
export function searchDocs(q: string) {
  const query = q.trim();
  if (!query) return [];
  if (query.length >= 3) {
    try {
      // 短语查询；双引号转义防 FTS 语法错误
      const match = `"${query.replace(/"/g, '""')}"`;
      return db.prepare(
        `SELECT ${LIST_COLS}, bm25(docs_fts) AS rank
         FROM docs_fts JOIN documents d ON d.rowid = docs_fts.rowid
         WHERE docs_fts MATCH ?
         ORDER BY rank LIMIT 50`,
      ).all(match);
    } catch {
      /* FTS 语法异常时降级 LIKE */
    }
  }
  const like = `%${query}%`;
  return db.prepare(
    `SELECT ${LIST_COLS}, 0 AS rank
     FROM documents d
     WHERE d.title LIKE ? OR d.content_text LIKE ? OR d.tags LIKE ?
     ORDER BY d.updated_at DESC LIMIT 50`,
  ).all(like, like, like);
}
