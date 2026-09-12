// Data sync via a PRIVATE git remote — keeps personal data out of the public repo.
// The remote URL lives only in server/data/.git/config (never hardcoded here).
//
// Usage (dev machine or portable package root):
//   node scripts/data-sync.mjs push                  # checkpoint db, commit & push server/data
//   node scripts/data-sync.mjs pull [git-url]        # first-time: pass private repo url; later: just `pull`
// Portable package (script copied to package root):
//   ./node/node data-sync.mjs pull https://github.com/<you>/<private-repo>.git
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const dataDir = existsSync(join(scriptDir, 'server', 'data'))
  ? join(scriptDir, 'server', 'data')
  : join(scriptDir, '..', 'server', 'data')

const cmd = process.argv[2]
const url = process.argv[3]

function git(args, capture = false) {
  return execSync(`git -C "${dataDir}" ${args}`, capture ? { encoding: 'utf8' } : { stdio: 'inherit' })
}

function probePort(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.once('connect', () => { s.end(); resolve(true) })
    s.once('error', () => resolve(false))
    setTimeout(() => { s.destroy(); resolve(false) }, 1000)
  })
}

async function main() {
  if (!existsSync(dataDir)) {
    console.error(`data dir not found: ${dataDir}`)
    process.exit(1)
  }
  const hasRepo = existsSync(join(dataDir, '.git'))

  if (cmd === 'pull') {
    if (await probePort(3210)) {
      console.error('Remainder server is running (port 3210). Quit the app first, then pull again.')
      process.exit(1)
    }
    if (!hasRepo) {
      if (!url) {
        console.error('first-time pull needs the private repo url:  node data-sync.mjs pull <git-url>')
        process.exit(1)
      }
      execSync(`git -C "${dataDir}" init -b main`, { stdio: 'inherit' })
      execSync(`git -C "${dataDir}" remote add origin "${url}"`, { stdio: 'inherit' })
    }
    git('fetch origin')
    git('reset --hard origin/main')
    console.log('OK: data pulled (last-write-wins).')
    return
  }

  if (cmd === 'push') {
    if (!hasRepo) {
      console.error('not initialized. Run once:\n  git -C server/data init -b main\n  git -C server/data remote add origin <your-private-repo-url>')
      process.exit(1)
    }
    // checkpoint sqlite WAL so remainder.db is self-contained before commit
    try {
      const driverPath = join(scriptDir, '..', 'server', 'node_modules', 'better-sqlite3')
      const Database = (await import(driverPath.replaceAll('\\', '/'))).default
      const db = new Database(join(dataDir, 'remainder.db'))
      db.pragma('wal_checkpoint(TRUNCATE)')
      db.close()
    } catch {
      /* server running or driver missing: wal files are committed as-is, sqlite recovers on the other side */
    }
    git('add -A')
    try {
      git(`commit -m "sync ${new Date().toISOString()}"`)
    } catch {
      console.log('no changes')
    }
    git('push origin main')
    console.log('OK: data pushed.')
    return
  }

  console.error('usage: node data-sync.mjs push | pull [git-url]')
  process.exit(1)
}

main()
