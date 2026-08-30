import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';
import sanitizeHtml from 'sanitize-html';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CLIP_IMAGE_DIR = join(__dirname, '..', '..', 'data', 'clip_images');
mkdirSync(CLIP_IMAGE_DIR, { recursive: true });

export interface ClipInput {
  html: string;
  url?: string;
  title?: string;
}

export interface ClipResult {
  title: string;
  contentHtml: string;
  excerpt: string;
  imageStats: { total: number; localized: number; failed: number };
}

/** 图片下载防盗链策略：mmbiz（微信公众号）不发 Referer，其他域名带原页 Referer */
function refererFor(imgUrl: string, pageUrl: string): string | undefined {
  try {
    if (new URL(imgUrl).hostname.endsWith('qpic.cn')) return undefined;
  } catch {
    /* ignore */
  }
  return pageUrl || undefined;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
};

function extOf(imgUrl: string, contentType: string | null): string {
  const byMime = contentType ? EXT_BY_MIME[contentType.split(';')[0].trim()] : undefined;
  if (byMime) return byMime;
  try {
    const p = new URL(imgUrl).pathname;
    const m = p.match(/\.(jpe?g|png|gif|webp|avif|bmp)$/i);
    if (m) return m[0].toLowerCase();
  } catch {
    /* ignore */
  }
  // 公众号图片常是 ...?wx_fmt=jpeg 之类无扩展名路径
  const q = imgUrl.match(/wx_fmt=(jpe?g|png|gif|webp)/i);
  if (q) return `.${q[1].toLowerCase().replace('jpeg', 'jpg')}`;
  return '.jpg';
}

/** 下载图片：超时 10s，失败重试 1 次。成功返回本地文件名，失败返回 null */
async function downloadImage(imgUrl: string, pageUrl: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 10_000);
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Remainder-Clipper/1.0',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      };
      const ref = refererFor(imgUrl, pageUrl);
      if (ref) headers.Referer = ref;
      const r = await fetch(imgUrl, { headers, signal: ac.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) throw new Error('empty body');
      const file = `${randomUUID()}${extOf(imgUrl, r.headers.get('content-type'))}`;
      writeFileSync(join(CLIP_IMAGE_DIR, file), buf);
      return file;
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

/** sanitize-html 白名单：不允许任何 style/script；img 只留 src/alt；a 强制新窗口打开 */
function sanitize(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      'p', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'img', 'a', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'strong', 'em', 'b', 'i', 'br', 'hr', 'figure', 'figcaption', 'span', 'div',
    ],
    allowedAttributes: {
      img: ['src', 'alt'],
      a: ['href', 'target', 'rel'],   // target/rel 由下方 transformTags 统一注入，需放行
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'data'],
    // 本地图片是相对路径 /api/clips/images/xxx，放行
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: '_blank', rel: 'noopener' },
      }),
    },
  });
}

/**
 * 剪藏解析管线：defuddle 提取正文 → 图片本地化（重写 src）→ 白名单清洗 → excerpt
 * 选区片段 defuddle 同样安全；任何一步失败都 fallback，不阻断入库
 */
export async function processClip(input: ClipInput): Promise<ClipResult> {
  const pageUrl = input.url ?? '';
  let title = (input.title ?? '').trim();
  let html = input.html;

  // 1. defuddle 提取正文（整页有效；片段可能返回 "<body></body>" 空壳，剥掉文档级标签后再判空）
  try {
    const result = await Defuddle(input.html, pageUrl || undefined);
    const stripped = (result?.content ?? '')
      .replace(/<\/?(html|head|body)[^>]*>/gi, '')
      .trim();
    if (stripped) {
      html = result.content;
      if (!title && result.title) title = result.title.trim();
    }
  } catch {
    /* fallback 原始 HTML */
  }
  if (!title) title = '未命名剪藏';

  // 剥掉文档级标签（原始整页 fallback 时避免 linkedom 丢弃内层 body 导致内容丢失）
  html = html.replace(/<\/?(html|head|body)[^>]*>/gi, '');

  // 2. 图片本地化：先取 data-src/data-original（懒加载），再下载重写 src
  // 注意：linkedom parseHTML('<body>…</body>') 会丢弃内层 body，必须用 div 容器包裹
  const stats = { total: 0, localized: 0, failed: 0 };
  const { document } = parseHTML(`<div id="clip-root">${html}</div>`);
  const root = document.getElementById('clip-root')!;
  const imgs = Array.from(root.querySelectorAll('img'));
  for (const img of imgs) {
    stats.total++;
    const raw =
      img.getAttribute('data-src') ||
      img.getAttribute('data-original') ||
      img.getAttribute('src') ||
      '';
    const alt = img.getAttribute('alt') ?? '';
    // 清掉懒加载残留属性，sanitize 阶段也会被白名单剔除
    for (const a of ['data-src', 'data-original', 'data-actualsrc', 'srcset', 'data-srcset', 'class', 'style', 'width', 'height']) {
      img.removeAttribute(a);
    }
    if (!raw || raw.startsWith('data:')) {
      // data: URI（常为占位 gif）原样保留；空 src 的 img 移除
      if (!raw) {
        img.remove();
        stats.total--;
      }
      continue;
    }
    let abs = raw;
    try {
      abs = new URL(raw, pageUrl || undefined).toString();
    } catch {
      /* 无法解析的 URL 按原样尝试 */
    }
    const file = await downloadImage(abs, pageUrl);
    if (file) {
      img.setAttribute('src', `/api/clips/images/${file}`);
      stats.localized++;
    } else {
      // 失败替换为占位（保留 alt 文字）
      stats.failed++;
      const ph = document.createElement('div');
      ph.textContent = `[图片加载失败${alt ? `：${alt}` : ''}]`;
      img.replaceWith(ph);
    }
  }
  const localizedHtml = root.innerHTML || html;

  // 3. 白名单清洗
  const contentHtml = sanitize(localizedHtml);

  // 4. excerpt：纯文本前 200 字
  const { document: textDoc } = parseHTML(`<div id="clip-root">${contentHtml}</div>`);
  const text = (textDoc.getElementById('clip-root')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const excerpt = text.slice(0, 200);

  return { title, contentHtml, excerpt, imageStats: stats };
}
