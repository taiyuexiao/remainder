import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';

export default async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => {
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  app.put('/api/settings/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const b = (req.body ?? {}) as { value?: string };
    if (b.value === undefined) return reply.code(400).send({ error: 'value 必填' });
    db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, String(b.value));
    return { key, value: String(b.value) };
  });
}
