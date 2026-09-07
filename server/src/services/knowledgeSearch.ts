import { db } from '../db/connection.js';

/**
 * 知识库全文搜索（M23）：FTS5 trigram（external content 关联 knowledge_items.rowid）。
 * 与 docs 搜索同构：>=3 字走 FTS MATCH，<3 字 LIKE 兜底；变更后全量 rebuild（KISS）。
 */

/** 全量重建索引（条目增删改后调用） */
export function rebuildKnowledgeFts(): void {
  db.exec(`INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild')`);
}

const LIST_COLS =
  'k.id, k.type, k.title, k.team_id, k.project_id, k.author, k.owners, k.channels, k.tags, k.ttl, k.status, k.acl, k.notify, k.related, k.useful_count, k.source_url, k.source_clip_id, k.source_doc_id, k.upstream_id, k.upstream_team, k.upstream_updated_at, ' +
  '(SELECT CASE WHEN u.updated_at > k.upstream_updated_at THEN 1 ELSE 0 END FROM knowledge_items u WHERE u.id = k.upstream_id) AS upstream_has_update, ' +
  'k.created_at, k.updated_at, k.expires_at';

export interface KnowledgeSearchOpts {
  q?: string;
  type?: string;
  channel?: string;
  tag?: string;
  status?: string;
  /** 团队隔离（M24）：只查该团队条目 */
  teamId?: string;
  /** 项目过滤（M25）：'none'=未分配 */
  projectId?: string;
  /** 默认 true：不含已过期条目（L1 快讯沉底逻辑） */
  hideExpired?: boolean;
  limit?: number;
}

/** 搜索/列表：支持 q 全文 + 类型/频道/标签过滤 + 过期过滤 */
export function searchKnowledge(opts: KnowledgeSearchOpts) {
  const {
    q = '',
    type,
    channel,
    tag,
    status = 'active',
    teamId,
    projectId,
    hideExpired = true,
    limit = 50,
  } = opts;

  const conds: string[] = [];
  const params: unknown[] = [];

  if (teamId) { conds.push('k.team_id = ?'); params.push(teamId); }
  if (projectId === 'none') { conds.push('k.project_id IS NULL'); }
  else if (projectId) { conds.push('k.project_id = ?'); params.push(projectId); }
  if (type) { conds.push('k.type = ?'); params.push(type); }
  // 默认含 open（探讨中）与 draft（agent 草稿待人审，M28）
  if (status && status !== 'any') { conds.push(`k.status IN (?, 'open', 'draft')`); params.push(status); }
  if (channel) { conds.push(`k.channels LIKE ?`); params.push(`%"${channel}"%`); }
  if (tag) { conds.push(`k.tags LIKE ?`); params.push(`%"${tag}"%`); }
  if (hideExpired) {
    conds.push(`(k.expires_at IS NULL OR k.expires_at > ?)`);
    params.push(new Date().toISOString());
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const base = `SELECT ${LIST_COLS} FROM knowledge_items k ${where} ORDER BY k.created_at DESC LIMIT ?`;

  const query = q.trim();
  if (query.length >= 3) {
    try {
      const match = `"${query.replace(/"/g, '""')}"`;
      const ftsConds = conds.length ? `AND ${conds.join(' AND ')}` : '';
      return db.prepare(
        `SELECT ${LIST_COLS}, bm25(knowledge_fts) AS rank
         FROM knowledge_fts
         JOIN knowledge_items k ON k.rowid = knowledge_fts.rowid
         WHERE knowledge_fts MATCH ? ${ftsConds}
         ORDER BY rank LIMIT ?`,
      ).all(match, ...params, limit);
    } catch {
      /* FTS 语法异常降级 LIKE */
    }
  }

  if (query) {
    const like = `%${query}%`;
    const textCond = conds.length
      ? `AND (k.title LIKE ? OR k.content_text LIKE ? OR k.tags LIKE ?)`
      : `WHERE (k.title LIKE ? OR k.content_text LIKE ? OR k.tags LIKE ?)`;
    const sql = `SELECT ${LIST_COLS} FROM knowledge_items k ${where} ${textCond} ORDER BY k.created_at DESC LIMIT ?`;
    return db.prepare(sql).all(...params, like, like, like, limit);
  }

  return db.prepare(base).all(...params, limit);
}
