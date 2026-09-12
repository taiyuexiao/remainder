// Data sync via a PRIVATE git remote — keeps personal data out of the public repo.
// The remote URL lives only in server/data/.git/config (never hardcoded here).
//
// Usage (dev machine or portable package root):
//   node scripts/data-sync.mjs push                  # checkpoint db, commit & push server/data
//   node scripts/data-sync.mjs pull [git-url]        # first-time: pass private repo url; later: just `pull`
//   node scripts/data-sync.mjs bootstrap             # first upload of a large data dir: chunked commits,
//                                                     # pushed one batch at a time (survives flaky networks)
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

/** 推送（带重试；网络窗口时开时关，逐批推进） */
async function pushWithRetry(pushArgs, label) {
  for (let i = 1; i <= 30; i++) {
    try {
      git(pushArgs)
      console.log(`pushed ${label}`)
      return
    } catch {
      console.log(`${label} push attempt ${i} failed, retry in 60s`)
      await new Promise((r) => setTimeout(r, 60_000))
    }
  }
  console.error(`FAILED to push ${label} after 30 attempts`)
  process.exit(1)
}

/** checkpoint sqlite WAL，让 remainder.db 自包含 */
async function checkpointDb() {
  try {
    const driverPath = join(scriptDir, '..', 'server', 'node_modules', 'better-sqlite3')
    const Database = (await import(driverPath.replaceAll('\\', '/'))).default
    const db = new Database(join(dataDir, 'remainder.db'))
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.close()
  } catch {
    /* server running or driver missing: wal files are committed as-is, sqlite recovers on the other side */
  }
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

  if (cmd === 'bootstrap') {
    // 首次上传大数据目录：分批提交 + 逐批推送（网络抖断时大 push 必挂，小批次能活下来）
    if (!hasRepo) {
      console.error('not initialized. Run once:\n  git -C server/data init -b main\n  git -C server/data remote add origin <your-private-repo-url>')
      process.exit(1)
    }
    checkpointDb()
    const { readdirSync, statSync } = await import('node:fs')
    // 批次：① 数据库与小文件 ② assets/exports/clip_images ③ live2d-models 每个模型一批
    const batches = []
    const live2dDir = join(dataDir, 'live2d-models')
    batches.push(['.gitignore', 'remainder.db', 'remainder.db-shm', 'remainder.db-wal'])
    const mid = ['assets', 'exports', 'clip_images'].filter((d) => existsSync(join(dataDir, d)))
    if (mid.length) batches.push(mid)
    if (existsSync(live2dDir)) {
      for (const m of readdirSync(live2dDir)) {
        if (statSync(join(live2dDir, m)).isDirectory()) batches.push([`live2d-models/${m}`])
      }
      batches.push(['live2d-models/README.txt'].filter((f) => existsSync(join(dataDir, f))))
    }
    // 孤儿分支重建历史（保留旧 main 为 backup-full）
    try { git('branch -f backup-full main') } catch { /* 尚无 main 也行 */ }
    git('checkout --orphan staged')
    git('rm -r --cached . --ignore-unmatch')
    let n = 0
    for (const files of batches) {
      if (!files.length) continue
      n++
      for (const f of files) {
        if (existsSync(join(dataDir, f))) git(`add -- "${f}"`)
      }
      git(`commit -m "bootstrap batch ${n}: ${files[0]}${files.length > 1 ? ' …' : ''}"`)
      await pushWithRetry(n === 1 ? 'push -f origin staged:main' : 'push origin staged:main', `batch ${n}/${batches.length}`)
    }
    git('branch -M staged main')
    console.log('OK: bootstrap done, all batches pushed.')
    return
  }

  if (cmd === 'push') {
    if (!hasRepo) {
      console.error('not initialized. Run once:\n  git -C server/data init -b main\n  git -C server/data remote add origin <your-private-repo-url>')
      process.exit(1)
    }
    // checkpoint sqlite WAL so remainder.db is self-contained before commit
    await checkpointDb()
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
