/* M31 agent loop 实测：建任务 / 查日程 / 文档整理链（search→format→move） */
(async () => {
  const B = 'http://127.0.0.1:3210';
  const J = { 'Content-Type': 'application/json' };

  // 造一篇格式散乱的测试文档
  const messy = await (await fetch(B + '/api/documents', {
    method: 'POST', headers: J,
    body: JSON.stringify({
      title: 'm31-散乱文档',
      content: '项目进展汇报\n首先是背景 这个项目是评测平台\n我们做了数据集模块\n然后遇到一些问题\n版本管理很混乱\n接下来打算 统一接口 补齐测试',
    }),
  })).json();
  console.log('messy doc:', messy.id.slice(0, 8));

  // 开会话
  const conv = await (await fetch(B + '/api/conversations', { method: 'POST', headers: J, body: '{}' })).json();

  const ask = async (text) => {
    const r = await fetch(`${B}/api/conversations/${conv.id}/messages`, {
      method: 'POST', headers: J, body: JSON.stringify({ content: text }),
    });
    return r.json();
  };

  // 1. 自然语言建任务
  let r = await ask('明天下午5点提醒我交周报');
  console.log('\n== 建任务 ==');
  console.log('reply:', r.content);
  console.log('applied:', JSON.stringify(r.applied));

  // 2. 查日程
  r = await ask('我明天有什么安排');
  console.log('\n== 查日程 ==');
  console.log('reply:', (r.content ?? '').slice(0, 200));
  console.log('applied:', JSON.stringify(r.applied));

  // 3. 文档整理链
  r = await ask('搜一下"散乱"相关的文档，帮我把格式标题级别整理好，然后移到「m31测试」文件夹');
  console.log('\n== 文档整理链 ==');
  console.log('reply:', (r.content ?? '').slice(0, 300));
  console.log('applied:', JSON.stringify(r.applied, null, 1));

  // 验证结果
  const doc = await (await fetch(B + '/api/documents/' + messy.id)).json();
  const folder = doc.folder_id ? await (await fetch(`${B}/api/doc-folders/${doc.folder_id}/contents`)).json().catch(() => null) : null;
  console.log('\ndoc content now:', doc.content.slice(0, 200));
  console.log('folder_id:', doc.folder_id);

  // 清理
  const tasks = await (await fetch(B + '/api/tasks?type=idea')).json().catch(() => []);
  for (const t of tasks) if (t.title.includes('交周报')) await fetch(B + '/api/tasks/' + t.id, { method: 'DELETE' });
  if (doc.folder_id) await fetch(B + '/api/doc-folders/' + doc.folder_id, { method: 'DELETE' }).catch(() => {});
  await fetch(B + '/api/documents/' + messy.id, { method: 'DELETE' });
  await fetch(B + '/api/conversations/' + conv.id, { method: 'DELETE' });
  console.log('\ncleaned');
})();
