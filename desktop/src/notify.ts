// Tauri 环境下发原生系统通知（Windows 通知中心）；浏览器环境静默跳过
const isTauri = '__TAURI_INTERNALS__' in window;

export async function notifyNative(title: string, body: string) {
  if (!isTauri) return;
  try {
    const {
      isPermissionGranted,
      requestPermission,
      sendNotification,
    } = await import('@tauri-apps/plugin-notification');
    if (!(await isPermissionGranted())) {
      await requestPermission();
    }
    if (await isPermissionGranted()) {
      sendNotification({ title, body });
    }
  } catch { /* 通知失败不影响应用 */ }
}
