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

// 在页面里取选区 HTML（scripting.executeScript 注入版，content script 未加载时的兜底）
function grabSelectionInPage() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const container = document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) {
    container.appendChild(sel.getRangeAt(i).cloneContents());
  }
  for (const img of container.querySelectorAll('img')) {
    const real = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src');
    if (real) {
      try { img.setAttribute('src', new URL(real, document.baseURI).href); } catch { /* keep */ }
    }
  }
  for (const a of container.querySelectorAll('a[href]')) {
    try { a.setAttribute('href', new URL(a.getAttribute('href'), document.baseURI).href); } catch { /* keep */ }
  }
  return container.innerHTML;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'sync-to-remainder' || !tab?.id) return;

  let payload = null;

  // 1) 优先走已注入的 content script
  try {
    payload = await chrome.tabs.sendMessage(tab.id, { type: 'REMAINDER_GET_SELECTION' });
  } catch { /* content script 未注入：扩展重载前的旧标签页、chrome:// 等 */ }

  // 2) content script 没拿到 → scripting 现场注入取选区（右键点击已授予 activeTab）
  if (!payload?.html) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: grabSelectionInPage,
      });
      const html = results?.[0]?.result;
      if (html) payload = { html, url: tab.url ?? '', title: tab.title ?? '' };
    } catch { /* chrome:// / 应用商店等禁注入页面 */ }
  }

  // 3) 右键的是图片：直接剪藏图片
  if (!payload?.html && info.mediaType === 'image' && info.srcUrl) {
    payload = { html: `<img src="${info.srcUrl}">`, url: tab.url ?? '', title: tab.title ?? '' };
  }

  // 4) 纯文本兜底
  if (!payload?.html && info.selectionText) {
    payload = { html: `<p>${info.selectionText}</p>`, url: tab.url ?? '', title: tab.title ?? '' };
  }

  if (!payload?.html) {
    notify('Remainder 剪藏', '没有选中内容（先在页面上选中一段文字或图片）');
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
    notify(
      '同步失败',
      e.message === 'Failed to fetch'
        ? '连不上本地服务：请确认 Remainder 已启动（双击桌面图标）'
        : `服务返回错误：${e.message}`,
    );
  }
});
