import type { FastifyInstance } from 'fastify';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/connection.js';
import { currentUser, isMember, PERSONAL_TEAM_ID, teamExists } from '../services/teams.js';
import { openPath } from '../services/openPath.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = join(__dirname, '..', '..', 'data', 'exports');

/**
 * OKF bundle 导出（M26 / K3 顺手做，v3 方案 §8）。
 * Google OKF v0.2：markdown + YAML frontmatter，type 必填；信任信号 stale_after/sources/status。
 * 字段映射：我们的 ttl/expires_at→stale_after、source_url→sources、status→status、related→正文交叉链接。
 */

function yamlEscape(s: string): string {
  return /[:#\[\]{}"'\n]/.test(s) ? JSON.stringify(s) : s;
}

function slug(title: string): string {
  return title.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60) || 'untitled';
}

export default async function okfExportRoutes(app: FastifyInstance) {
  app.post('/api/knowledge/export/okf', async (req, reply) => {
    const b = (req.body ?? {}) as { team?: string };
    const teamId = b.team || PERSONAL_TEAM_ID;
    if (!teamExists(teamId)) return reply.code(404).send({ error: '团队不存在' });
    if (!isMember(teamId, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });

    const items = db
      .prepare(
        `SELECT k.*, p.name AS project_name FROM knowledge_items k
         LEFT JOIN kb_projects p ON p.id = k.project_id
         WHERE k.team_id = ? AND k.status != 'archived' ORDER BY k.type, k.created_at`,
      )
      .all(teamId) as Record<string, unknown>[];

    const team = db.prepare('SELECT name FROM teams WHERE id = ?').get(teamId) as { name: string };
    const date = new Date().toISOString().slice(0, 10);
    const dir = join(EXPORT_DIR, `okf-${slug(team.name)}-${date}`);
    mkdirSync(dir, { recursive: true });

    for (const it of items) {
      const parse = (s: unknown): string[] => {
        try { return JSON.parse((s as string) || '[]'); } catch { return []; }
      };
      const tags = parse(it.tags);
      const channels = parse(it.channels);
      const owners = parse(it.owners);
      const related = parse(it.related);
      const fm: string[] = ['---'];
      fm.push(`type: ${it.type}`); // OKF 唯一必填
      fm.push(`title: ${yamlEscape(it.title as string)}`);
      fm.push(`status: ${it.status}`);
      if (it.expires_at) fm.push(`stale_after: ${(it.expires_at as string).slice(0, 10)}`);
      if (it.source_url) fm.push(`sources:\n  - ${yamlEscape(it.source_url as string)}`);
      if (it.author) fm.push(`author: ${yamlEscape(it.author as string)}`);
      if (owners.length) fm.push(`owners:\n${owners.map((o) => `  - ${yamlEscape(o)}`).join('\n')}`);
      if (tags.length) fm.push(`tags:\n${tags.map((t) => `  - ${yamlEscape(t)}`).join('\n')}`);
      if (channels.length) fm.push(`channels:\n${channels.map((c) => `  - ${yamlEscape(c)}`).join('\n')}`);
      if (it.project_name) fm.push(`project: ${yamlEscape(it.project_name as string)}`);
      fm.push(`created: ${(it.created_at as string).slice(0, 10)}`);
      fm.push(`updated: ${(it.updated_at as string).slice(0, 10)}`);
      fm.push('---');

      let body = `# ${it.title}\n\n${it.content ?? ''}`;
      if (it.conclusion) body += `\n\n## 结论\n\n${it.conclusion}`;
      if (related.length) {
        body += `\n\n## 相关\n\n${related.map((r) => `- [${r}](./${r}.md)`).join('\n')}`;
      }
      writeFileSync(join(dir, `${it.type}--${slug(it.title as string)}.md`), fm.join('\n') + '\n\n' + body, 'utf-8');
    }

    openPath(dir);
    return { dir, count: items.length };
  });
}
