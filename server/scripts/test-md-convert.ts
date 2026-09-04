import { markdownToDoc } from '../../desktop/src/editor/mdConvert.js';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  console.log(cond ? `✓ ${name}` : `✗ ${name}`);
  cond ? pass++ : fail++;
};

// 真实 LLM 输出样例
const llmOut = `# 项目背景

我们做了一个评测平台

# 核心功能

## 数据集管理

- 一行一题

## 评测执行

- 支持并发

# 下周计划

做执行模块`;

const doc = markdownToDoc(llmOut);
const types = doc.content.map((n) => n.type);
check('根节点是 doc', doc.type === 'doc');
check('含 2 个一级标题', doc.content.filter((n) => n.type === 'heading' && n.attrs?.level === 1).length === 3);
check('含 2 个二级标题', doc.content.filter((n) => n.type === 'heading' && n.attrs?.level === 2).length === 2);
check('含 2 个无序列表', doc.content.filter((n) => n.type === 'bulletList').length === 2);
check('段落文本完整', JSON.stringify(doc).includes('我们做了一个评测平台'));
check('结构顺序正确', types[0] === 'heading' && types[1] === 'paragraph' && types[2] === 'heading');

// 任务列表 + 引用 + 代码块
const mixed = `## 待办\n- [ ] 写周报\n- [x] 发邮件\n> 注意：别漏了\n\`\`\`\nconst a = 1;\n\`\`\``;
const doc2 = markdownToDoc(mixed);
check('任务列表', doc2.content.some((n) => n.type === 'taskList'));
check('任务 checked 标记', JSON.stringify(doc2).includes('"checked":true'));
check('引用块', doc2.content.some((n) => n.type === 'blockquote'));
check('代码块', doc2.content.some((n) => n.type === 'codeBlock'));

// markdown 表格
const tbl = `| 列 | 内容 |\n| --- | --- |\n| a | b |\n| c | d |`;
const doc3 = markdownToDoc(tbl);
check('表格', doc3.content.some((n) => n.type === 'table'));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
