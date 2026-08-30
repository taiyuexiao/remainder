import Database from 'better-sqlite3';
const db = new Database('data/remainder.db');
const rows = db.prepare("SELECT id, name, type, status, done_at, updated_at FROM projects WHERE name LIKE 'M10V%'").all();
console.log(JSON.stringify(rows, null, 1));
