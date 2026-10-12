import type { BrowserWindow } from 'electron'
import {
  decideMainRendererRecovery,
  recoveryDelayMs
} from './main-window-recovery-policy'
import { markFrameUnavailable } from './safe-send'
import { loadMainRenderer } from './window'

const SESSION_DISPOSE_WAIT_MS = 2_000

export {
  decideMainRendererRecovery,
  recoveryDelayMs,
  MAIN_RENDERER_RECOVERY_LIMIT,
  MAIN_RENDERER_RECOVERY_WINDOW_MS
} from './main-window-recovery-policy'

export interface MainRendererRecoveryDeps {
  isQuitting(): boolean
  log(message: string): void
  hideDshSurface(): void
  /** 同步杀掉 PTY 子进程（含 grok），并让 listRecoverable 立刻变空。 */
  killPtyChildren(): void
  disposeAgentSessions(): Promise<void> | void
  onGaveUp(summary: string): void
}

/**
 * 主窗口渲染进程退出后重载同一扇窗口。
 * 悬浮窗有自己的恢复，不能走这里——那边失败不应杀掉主窗口的终端。
 * 重载前先杀掉 PTY：把刚打崩页面的 grok 再挂回去会循环崩溃。
 */
export function attachMainRendererRecovery(
  win: BrowserWindow,
  deps: MainRendererRecoveryDeps
): void {
  let crashTimes: number[] = []
  let reloadPending = false
  let awaitingLoad = false
  let gaveUp = false

  const settleSessions = async (): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.resolve(deps.disposeAgentSessions()),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, SESSION_DISPOSE_WAIT_MS)
        })
      ])
    } catch (error) {
      deps.log(`agent session dispose failed during renderer recovery: ${String(error)}`)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  const recover = (summary: string): void => {
    const decision = decideMainRendererRecovery({
      quitting: deps.isQuitting(),
      windowDestroyed: win.isDestroyed(),
      reloadPending,
      now: Date.now(),
      crashTimes
    })
    crashTimes = decision.crashTimes
    if (decision.action === 'ignore') return

    markFrameUnavailable(win.webContents)
    deps.hideDshSurface()
    deps.killPtyChildren()
    deps.log(`main renderer recovery: ${summary}; action=${decision.action}`)

    if (decision.action === 'give-up') {
      gaveUp = true
      void settleSessions()
      setTimeout(() => {
        if (deps.isQuitting() || win.isDestroyed()) return
        deps.onGaveUp(summary)
      }, 0)
      return
    }

    reloadPending = true
    const delay = recoveryDelayMs(crashTimes.length)
    void settleSessions().finally(() => {
      setTimeout(() => {
        reloadPending = false
        if (deps.isQuitting() || win.isDestroyed() || gaveUp) return
        awaitingLoad = true
        void loadMainRenderer(win).catch((error: unknown) => {
          awaitingLoad = false
          reloadPending = false
          recover(`main renderer reload failed: ${String(error)}`)
        })
      }, delay)
    })
  }

  win.webContents.on('render-process-gone', (_event, details) => {
    recover(`render process gone: ${details.reason} (exit ${details.exitCode})`)
  })
  win.webContents.on('dom-ready', () => {
    reloadPending = false
    awaitingLoad = false
  })
  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
      // 只处理我们自己发起的重载失败。首次加载和被取消的导航（-3）不算崩溃。
      if (!awaitingLoad || !isMainFrame || errorCode === -3 || gaveUp) return
      awaitingLoad = false
      reloadPending = false
      recover(`page load failed: ${errorDescription} (${errorCode})`)
    }
  )
}
