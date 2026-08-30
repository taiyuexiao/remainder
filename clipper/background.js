// Remainder Clipper - background service worker (MV3)
const API = 'http://127.0.0.1:3210';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sync-to-remainder',
    title: '同步到 Remainder',
    contexts: ['selection', 'image'],
  });
});

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'sync-to-remainder' || !tab?.id) return;

  let payload;
  try {
    // 向页面 content script 索要选区 HTML（含图片）
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'REMAINDER_GET_SELECTION' });
    payload = resp;
  } catch {
    // content script 未注入（如 chrome:// 页面），用 selectionText 兜底
    payload = {
      html: info.selectionText ? `<p>${info.selectionText}</p>` : null,
      url: tab.url ?? '',
      title: tab.title ?? '',
    };
  }

  if (!payload?.html) {
    notify('Remainder 剪藏', '没有选中内容');
    return;
  }

  try {
    const r = await fetch(`${API}/api/clips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: payload.html,
        url: payload.url,
        title: payload.title,
        source: 'extension',
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const clip = await r.json();
    notify('已同步到 Remainder ✓', clip.title || payload.title || '剪藏成功');
  } catch (e) {
    notify('同步失败', `请确认 Remainder 后端已启动（${e.message}）`);
  }
});
