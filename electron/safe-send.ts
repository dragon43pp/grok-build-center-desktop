import { BrowserWindow, type WebContents } from 'electron'
import { isQuitting } from './quitting'

/**
 * 渲染进程崩溃后 WebContents 还在，isDestroyed() 仍是 false，但帧已经 dispose。
 * 这时 webContents.send 不抛异常，而是自己 console.error
 * 「Render frame was disposed」。诊断日志会把这句再广播出去，形成
 * send 失败 → 记日志 → 再 send 的循环。发送前先看这道闸门。
 *
 * isCrashed() 在 render-process-gone 之后为 true，但 loadURL 一开始它就变回
 * false，新帧要到 dom-ready 才存在。这段空窗用 WeakSet 盖住。
 */
const unavailableFrames = new WeakSet<WebContents>()

export function markFrameUnavailable(contents: WebContents): void {
  unavailableFrames.add(contents)
}

export function markFrameReady(contents: WebContents): void {
  unavailableFrames.delete(contents)
}

export function installIpcFrameGate(contents: WebContents): void {
  contents.on('render-process-gone', () => {
    markFrameUnavailable(contents)
  })
  contents.on('dom-ready', () => {
    markFrameReady(contents)
  })
}

export function canReceiveIpc(contents: WebContents | null | undefined): boolean {
  if (!contents || unavailableFrames.has(contents)) return false
  try {
    return !contents.isDestroyed() && !contents.isCrashed()
  } catch {
    return false
  }
}

/** 帧不可用时直接跳过，不写日志，避免诊断广播把失败再送回去。 */
export function safeSend(
  contents: WebContents | null | undefined,
  channel: string,
  ...args: unknown[]
): boolean {
  if (isQuitting() || !contents || !canReceiveIpc(contents)) return false
  try {
    contents.send(channel, ...args)
    return true
  } catch {
    markFrameUnavailable(contents)
    return false
  }
}

export function sendToEachWindow(channel: string, ...args: unknown[]): void {
  if (isQuitting()) return
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    safeSend(win.webContents, channel, ...args)
  }
}
