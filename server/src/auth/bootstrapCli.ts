import { migrate } from '../db/schema.js';
import { ensureBootstrapUser } from './service.js';
import { db } from '../db/connection.js';

async function main(): Promise<void> {
  migrate();
  await ensureBootstrapUser();
  const row = db.prepare('SELECT id, username, role FROM users ORDER BY created_at LIMIT 1').get() as
    | { id: string; username: string; role: string }
    | undefined;
  if (!row) throw new Error('bootstrap user was not created');
  console.log(`BOOTSTRAP_OK user=${row.username} role=${row.role}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
