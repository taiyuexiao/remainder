import { parseTableText, rowsToTableHtml } from '../../desktop/src/editor/tableDetect.js';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  console.log(cond ? `✓ ${name}` : `✗ ${name}`);
  cond ? pass++ : fail++;
};

// 1. 用户样例：2+ 空格对齐列 + ━ 分隔线
const sample = `列               内容                                   是否必填
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   input            输入（比如问题："退货政策是什么？"）   严格说也选填，但一般都填

   expectedOutput   标准答案（"7 天内无理由退货"）         选填 ← 这就是你问的"可选"

   metadata         备注（难度、业务分类等）               选填

   sourceTraceId    溯源指针（下面讲）                     选填`;
const r1 = parseTableText(sample);
check('样例识别为表格', r1 !== null);
check('5 行（分隔线/空行忽略）', r1?.length === 5);
check('3 列', r1?.[0].length === 3);
check('首列首格为"列"', r1?.[0][0] === '列');
check('含中文内容', r1?.[2][1].includes('标准答案') ?? false);

// 2. markdown 管道
const md = `| 名称 | 类型 | 必填 |
| --- | --- | --- |
| input | string | 是 |
| output | string | 否 |`;
const r2 = parseTableText(md);
check('markdown 识别', r2 !== null && r2.length === 3 && r2[0].length === 3);

// 3. Tab 分列（Excel）
const tab = 'A1\tB1\tC1\nA2\tB2\tC2\nA3\tB3\tC3';
const r3 = parseTableText(tab);
check('Tab 分列识别', r3 !== null && r3.length === 3);

// 4. 普通散文不识别（防误报）
const prose = '今天天气不错。  我去开了个会。\n下午继续写代码。  晚上看文档。';
check('散文不误报', parseTableText(prose) === null);

// 5. 单行不识别
check('单行不识别', parseTableText('a  b  c') === null);

// 6. 生成 HTML 合法
const html = rowsToTableHtml(r1!);
check('生成 <table>', html.startsWith('<table>') && html.includes('<th>列</th>'));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
