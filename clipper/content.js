// Remainder Clipper - content script
// 响应 background 的取选区请求，返回含图片的选区 HTML

function getSelectionHtml() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return null;

  const container = document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) {
    container.appendChild(sel.getRangeAt(i).cloneContents());
  }

  // 懒加载图片：data-src/data-original 优先，写回 src
  for (const img of container.querySelectorAll('img')) {
    const real = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src');
    if (real) {
      try {
        img.setAttribute('src', new URL(real, document.baseURI).href);
      } catch { /* 非法 URL 保持原样 */ }
    }
  }

  // 相对链接补全
  for (const a of container.querySelectorAll('a[href]')) {
    try {
      a.setAttribute('href', new URL(a.getAttribute('href'), document.baseURI).href);
    } catch { /* ignore */ }
  }

  return container.innerHTML;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'REMAINDER_GET_SELECTION') {
    sendResponse({
      html: getSelectionHtml(),
      url: location.href,
      title: document.title,
    });
  }
  return true; // 异步 sendResponse
});
