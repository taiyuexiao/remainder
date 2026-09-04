import { spawn } from 'node:child_process';

/**
 * 用系统默认方式打开路径/链接（跨平台）：
 * - Windows: explorer
 * - macOS: open
 * - Linux: xdg-open
 */
export function openPath(target: string): void {
  const cmd =
    process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(cmd, [target], { detached: true, stdio: 'ignore' });
  child.unref();
}
