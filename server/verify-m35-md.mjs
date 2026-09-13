import { mdToTiptapJson } from './src/services/markdown.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } };

// 1. 标题/列表/粗体
const doc = JSON.parse(mdToTiptapJson('## 标题一\n\n- 第一项\n- **加粗项**尾巴\n\n**HRM**\n- 子项\n\n普通 **粗体** 混排'));
ok(doc.type === 'doc', 'root doc');
ok(doc.content[0].type === 'heading' && doc.content[0].attrs.level === 2, 'h2 heading');
const list = doc.content[1];
ok(list.type === 'bulletList' && list.content.length === 2, 'bullet list 2 items');
const item2texts = list.content[1].content[0].content;
ok(item2texts[0].text === '加粗项' && item2texts[0].marks?.[0]?.type === 'bold', 'bold mark in list item');
ok(item2texts[1].text === '尾巴' && !item2texts[1].marks, 'plain text after bold');
const grp = doc.content[2];
ok(grp.type === 'paragraph' && grp.content[0].text === 'HRM' && grp.content[0].marks?.[0]?.type === 'bold', 'standalone **HRM** group header -> bold paragraph');
const para = doc.content[4];
ok(para.content.length === 3 && para.content[1].marks?.[0]?.type === 'bold', 'mixed paragraph inline bold');

// 2. 空输入 -> 合法空文档
const empty = JSON.parse(mdToTiptapJson(''));
ok(empty.content[0].type === 'paragraph', 'empty md -> empty doc');

// 3. 真实 highagent 日报
const md = readFileSync(process.env.HOME + '/daily-reports/2026-09-13.md', 'utf8');
const real = JSON.parse(mdToTiptapJson(md));
const types = new Set(real.content.map(n => n.type));
ok(real.content[0].type === 'heading' && real.content[0].attrs.level === 1, 'real: h1 title');
ok(types.has('heading') && types.has('bulletList') && types.has('paragraph'), 'real: has heading/list/paragraph');
const hasBold = JSON.stringify(real).includes('"type":"bold"');
ok(hasBold, 'real: contains bold marks');
ok(!JSON.stringify(real).includes('**'), 'real: no leftover **');

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
