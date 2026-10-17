import { spawn, type ChildProcess } from 'node:child_process'

/**
 * 杀掉整棵进程树。
 *
 * `child.kill()` 只作用于直接子进程；在 Windows 上，被观察的 CLI 常常经由
 * wsl.exe / cmd.exe / pwsh.exe 再拉起孙进程，杀不干净就会留下孤儿解释器，
 * 正是「超时了但进程还在」的来源。Windows 用 `taskkill /T /F`，POSIX 在
 * 子进程自成一个进程组时（detached）对进程组发信号。
 */
export function killProcessTree(child: ChildProcess): void {
  const pid = child.pid
  if (!pid) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      }).unref()
    } catch {
      child.kill()
    }
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}
