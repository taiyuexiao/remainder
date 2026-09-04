// 从 Eikanya/Live2d-model 下载崩坏学园2全部模型（Cubism 2 格式）
// 用法: node download-benghuai2.mjs <bh2-tree.json路径> <输出目录>
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const [treeJson, outRoot] = process.argv.slice(2);
const tree = JSON.parse(await readFile(treeJson, 'utf8'));
const files = tree.tree.filter((f) => f.type === 'blob');

const MIRRORS = [
  'https://ghfast.top/https://raw.githubusercontent.com/Eikanya/Live2d-model/master/%E5%B4%A9%E5%9D%8F%E5%AD%A6%E5%9B%AD2/',
  'https://raw.githubusercontent.com/Eikanya/Live2d-model/master/%E5%B4%A9%E5%9D%8F%E5%AD%A6%E5%9B%AD2/',
];

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

async function download(file) {
  const dest = join(outRoot, file.path);
  if (existsSync(dest) && statSync(dest).size === file.size) return 'skip';
  mkdirSync(dirname(dest), { recursive: true });
  for (const base of MIRRORS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(base + encodePath(file.path), { signal: AbortSignal.timeout(90000) });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
        if (statSync(dest).size !== file.size) throw new Error('size mismatch');
        return 'ok';
      } catch (e) {
        if (attempt === 2 && base === MIRRORS[MIRRORS.length - 1]) throw e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
}

let done = 0;
const failed = [];
for (const f of files) {
  try {
    const r = await download(f);
    done++;
    console.log(`[${done}/${files.length}] ${r} ${f.path}`);
  } catch (e) {
    failed.push(f.path);
    console.log(`[FAIL] ${f.path}: ${e.message}`);
  }
}
console.log(`\nDONE: ${done}/${files.length}, failed: ${failed.length}`);
await writeFile(join(outRoot, '_download-bh2-failed.txt'), failed.join('\n'));
