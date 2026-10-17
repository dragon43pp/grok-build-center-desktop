import { app, BrowserWindow, dialog } from 'electron'
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { createWindow } from './window'
import { attachMainRendererRecovery } from './main-window-recovery'
import { canReceiveIpc, installIpcFrameGate, safeSend, sendToEachWindow } from './safe-send'
import { registerIpc, type IpcContext } from './ipc'
import { PtyHostClient } from './pty/PtyHostClient'
import { EventLog } from './events/EventLog'
import { loadMainPrefs, getMainPrefs } from './main-prefs'
import { markQuitting, isQuitting } from './quitting'
import {
  registerGlobalShortcut,
  unregisterGlobalShortcut,
  isGlobalShortcutRegistered
} from './shortcuts'
import {
  createTray,
  rebuildTrayMenu,
  toggleWindowVisibility,
  clickTrayMenuItem,
  trayMenuState,
  type Tray,
  type TrayCallbacks
} from './tray'
import { startThemeWatcher, stopThemeWatcher } from './themes-watch'
import {
  AppEventChannel,
  FeishuEventChannel,
  RemoteEventChannel,
  UpdateEventChannel,
  type BridgeLaunchAck,
  type BridgeLaunchRequest
} from '../shared/ipc-contract'
import {
  ElectronFloatingWindowController,
  isAgentProjectionChannel,
  type FloatingWindowController
} from './floating/FloatingWindowController'
import { registerFloatingRendererScheme } from './floating/FloatingRendererProtocol'
import { AiCliDiscoveryService } from './ai-cli-discovery'
import { AgentSessionRuntime } from './agents/AgentSessionRuntime'
import { SessionLedger } from './sessions/SessionLedger'
import { defaultSkillRoots, installAgentSkills } from './agents/installAgentSkill'
import { TaskLedger } from './sessions/TaskLedger'
import { ProjectStore } from './sessions/ProjectStore'
import { ObserverRegistry } from './agents/ObserverRegistry'
import { FixtureObserverAdapter } from './agents/adapters/fixture'
import { ClaudeObserverAdapter } from './agents/adapters/claude/ClaudeObserverAdapter'
import { OpenCodeObserverAdapter } from './agents/adapters/opencode'
import { CodexObserverAdapter } from './agents/adapters/codex'
import { PiObserverAdapter } from './agents/adapters/pi'
import { KimiObserverAdapter } from './agents/adapters/kimi'
import { GrokObserverAdapter } from './agents/adapters/grok'
import { HookIngress } from './hooks/HookIngress'
import { WorkspaceReader } from './workspace/WorkspaceReader'
import { WorkspaceReaderEventChannel } from '../shared/workspace-reader'
import { DshHostManager } from './dsh-host/DshHostManager'
import { DshWireProxy } from './dsh-host/DshWireProxy'
import { DshProjectionBridge } from './dsh-host/DshProjectionBridge'
import { DshSessionProjector } from './dsh-host/DshSessionProjector'
import { DshWebSurfaceController } from './dsh-surface/DshWebSurfaceController'
import { ElectronUpdaterDriver } from './update/UpdateDriver'
import { UpdateService } from './update/UpdateService'
import packageMetadata from '../package.json'
import { registerWindowsAppUserModelId } from './app-icons'
import { resolveAppUserDataDir } from './app-paths'
import type { BridgeHistorySession, BridgeResumeResult, BridgeSessionInfo } from '../shared/bridge-protocol'
import { createFeishuRouter } from './feishu/router'
import { openDomesticWorkbuddy } from './sessions/open-workbuddy'
import { extractAscCliArgv, runAscCli } from './cli/ascCli'
import { BridgeServer } from './bridge/BridgeServer'
import { OpenCodeControlPlane } from './bridge/OpenCodeControlPlane'
import { BridgeStateStore } from './bridge/state'
import { BridgeError } from './bridge/errors'
import { RemoteDesktopClient } from './remote/RemoteDesktopClient'
import { RemoteDshCoordinator } from './remote/RemoteDshCoordinator'
import { FeishuService } from './feishu/service'
import { FeishuStore } from './feishu/store'
import { runtimeSessionSource } from './remote/runtimeSessionSource'
import {
  combineRemoteSessionSources,
  dshRemoteSessionSource
} from './remote/dshRemoteSessionSource'
import { runtimeRemotePtyHost } from './remote/runtimeRemotePtyHost'
import { runtimeRemoteLaunchHost } from './remote/runtimeRemoteLaunchHost'
import { runtimeRemoteWorkspaceHost } from './remote/runtimeRemoteWorkspaceHost'
import { DiagnosticLog } from './diagnostics/DiagnosticLog'
import { configurePricingCache } from './sessions/pricing'
import { discoverSessions } from './sessions'
import { startDigestScheduler, stopDigestScheduler } from './assistant/digest-scheduler'
import { DiagnosticLogEventChannel } from '../shared/diagnostic-log'


/**
 * 品牌更名（Agent Session Center）后 userData 目录同步改名：把旧品牌名目录里
 * 的本地数据（飞书 token、LLM key、主题、桥接 token 等）整体搬进新目录，
 * 避免老用户重新配置一遍。
 *
 * 注意：下面的旧目录名是定位旧数据的唯一钥匙，在确认用户都已迁移完成之前，
 * 不要删除这两个字面量，也不要删除本函数。
 */
function migrateLegacyUserDataDir(appDataDir: string, newDir: string): void {
  const legacyDir = join(
    appDataDir,
    app.isPackaged ? 'Grok Build Center' : 'Grok Build Center Dev'
  )
  if (existsSync(newDir) || !existsSync(legacyDir)) return
  cpSync(legacyDir, newDir, { recursive: true })
}

// E2E/开发：隔离 userData，保证 stats/主题等持久化断言从干净状态出发。
// 必须在 app ready 之前调用。
// 环境变量统一为 ASC_ 前缀；早期工作名的前缀已全部废弃，不再做兼容读取。
registerWindowsAppUserModelId()
const userDataOverride = process.env['ASC_USER_DATA_DIR']
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
} else {
  const userDataDir = resolveAppUserDataDir(
    app.getPath('appData'),
    app.isPackaged
  )
  migrateLegacyUserDataDir(app.getPath('appData'), userDataDir)
  mkdirSync(userDataDir, { recursive: true })
  app.setPath('userData', userDataDir)
}
registerFloatingRendererScheme()
// 事件提示音在后台/非聚焦时也可能触发；允许无手势自动播放。
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const cliArgv = extractAscCliArgv(process.argv)
if (cliArgv) {
  void runAscCli(cliArgv, {
    stdout: process.stdout,
    stderr: process.stderr,
    userDataDir: app.getPath('userData')
  }).then((code) => app.exit(code))
}

const isPrimaryInstance = cliArgv ? false : app.requestSingleInstanceLock()

const diagnosticLogPath = join(app.getPath('userData'), 'logs', 'asc-diagnostic.jsonl')
const diagnosticLog = new DiagnosticLog(diagnosticLogPath)
if (isPrimaryInstance) {
  diagnosticLog.installConsoleCapture()
  app.on('web-contents-created', (_event, contents) => {
    // 闸门必须先于诊断监听注册：崩溃事件里先标帧不可用，再记日志，
    // 否则「记日志 → 广播」会打进已 dispose 的帧。
    installIpcFrameGate(contents)
    diagnosticLog.captureWebContents(contents)
  })
  // GPU 进程起不来时，Chromium 的行为是重试几次后打出
  // 「GPU process isn't usable. Goodbye.」并整体退出——窗口从未出现过，
  // 用户只看到「闪一下就没了」。`render-process-gone` 管不到 GPU 进程，
  // `child-process-gone` 是唯一能拿到 reason / exitCode 的地方，先写日志再弹窗。
  // 弹窗只给自救命令（带 --no-sandbox 重启），不自动重启：替所有用户静默关掉
  // GPU 沙箱不是这个开关该有的默认值，必须是用户自己按命令执行的决定。
  let gpuGoneCount = 0
  let gpuDialogShown = false
  app.on('child-process-gone', (_event, details) => {
    if (details.type !== 'GPU') return
    gpuGoneCount += 1
    diagnosticLog.append(
      'error',
      'main',
      `GPU process gone #${gpuGoneCount}: reason=${details.reason} exitCode=${details.exitCode}`
    )
    if (gpuDialogShown || gpuGoneCount < 2) return
    gpuDialogShown = true
    const isZh = app.getLocale().startsWith('zh')
    dialog.showErrorBox(
      isZh ? 'Agent Session Center 无法启动' : 'Agent Session Center cannot start',
      isZh
        ? `图形进程（GPU）反复启动失败，应用无法继续运行。远程控制软件的虚拟显示器、虚拟机或缺少显卡驱动都可能触发这个问题。\n\n请用下面的命令重新启动（本次运行会关闭 GPU 沙箱）：\n\n"${process.execPath}" --no-sandbox\n\n崩溃详情已写入诊断日志：\n${diagnosticLogPath}`
        : `The GPU process failed to start repeatedly, so the app cannot run. Virtual displays from remote-control software, VMs, or missing GPU drivers can all trigger this.\n\nStart it once with the GPU sandbox disabled:\n\n"${process.execPath}" --no-sandbox\n\nThe crash details were written to the diagnostic log:\n${diagnosticLogPath}`
    )
  })
}

const manager = new PtyHostClient(
  process.execPath,
  join(__dirname, 'ptyHostMain.js'),
  { ASC_PTY_HOST: '1' }
)
// 价目表缓存落在我们自己的 userData 下（`<userData>/pricing/models.json`），
// 绝不写进用户的 CLI 目录。会话层本身不认识 electron，所以在这里注入路径。
configurePricingCache(app.getPath('userData'))
const cliDiscovery = new AiCliDiscoveryService(
  join(app.getPath('userData'), 'ai-cli-scan.json')
)
const eventLog = new EventLog()
let floatingController: FloatingWindowController | null = null
const broadcastToAllWindows = (channel: string, payload: unknown): void => {
  // 退出、崩溃、重载空窗都不送。safeSend 跳过已 dispose 的帧，并且不写日志，
  // 避免「send 失败 → console.error → 诊断广播 → 再 send」把日志打到几百 MB。
  sendToEachWindow(channel, payload)
}
diagnosticLog.onChanged((change) => {
  broadcastToAllWindows(DiagnosticLogEventChannel.Changed, change)
})
const broadcastAgentChannel = (channel: string, payload: unknown): void => {
  if (isAgentProjectionChannel(channel, payload)) {
    floatingController?.publishProjection(payload)
  }
  broadcastToAllWindows(channel, payload)
}
// S1：Agent Observer 基础设施。fixture adapter 仅在 E2E 环境变量下启用。
const observerRegistry = new ObserverRegistry()
const hookIngress = new HookIngress()
const workspaceReader = new WorkspaceReader()
workspaceReader.onChanged((change) => {
  sendToEachWindow(WorkspaceReaderEventChannel.Changed, change)
})
manager.onTerminalRemoved((terminalId) => workspaceReader.unmount(terminalId))
observerRegistry.register(new ClaudeObserverAdapter(hookIngress))
observerRegistry.register(new OpenCodeObserverAdapter())
observerRegistry.register(new CodexObserverAdapter())
observerRegistry.register(new PiObserverAdapter())
observerRegistry.register(new KimiObserverAdapter({ hookIngress }))
observerRegistry.register(new GrokObserverAdapter({ hookIngress }))
observerRegistry.register(new FixtureObserverAdapter())
let sessionLedger: SessionLedger | undefined
let taskLedger: TaskLedger | undefined
let projectStore: ProjectStore | undefined
try {
  sessionLedger = new SessionLedger(app.getPath('userData'))
  taskLedger = new TaskLedger(app.getPath('userData'))
  projectStore = new ProjectStore(app.getPath('userData'))
} catch (error) {
  console.error('[asc] session ledger unavailable:', error)
}
try {
  installAgentSkills(defaultSkillRoots())
} catch (error) {
  console.error('[asc] agent skill install failed:', error)
}
const agentRuntime = new AgentSessionRuntime({
  pty: manager,
  discovery: cliDiscovery,
  history: eventLog,
  registry: observerRegistry,
  workspace: workspaceReader,
  ledger: sessionLedger,
  tasks: taskLedger,
  options: {
    runDirRoot: join(app.getPath('userData'), 'observer-runs'),
    broadcast: broadcastAgentChannel
  }
})
void agentRuntime.adoptLiveSessions().then(() => {
  // 安装更新会先停进程。账本可能还写着 running，重进标记却是 0。
  // 活着的宿主行已经接回，剩下没挂上的行补进重进名单。
  agentRuntime.repairInterruptedLedger()
}).catch((error) => {
  console.error('[asc] live session adopt failed:', error)
  sessionLedger?.demoteStaleRunning()
})
// DSH host：只启动扫描到的本机 / WSL 安装；懒启动并随 app 退出回收。
let dshSurfaceController: DshWebSurfaceController | null = null
let remoteDshCoordinator: RemoteDshCoordinator | null = null
const dshHost = new DshHostManager({
  defaultDshHome: join(app.getPath('userData'), 'dsh-home'),
  discovery: cliDiscovery,
  broadcast: broadcastToAllWindows,
  onBecameReady: () => dshProjector.start(),
  onLeftReady: () => {
    dshProjector.stop()
    dshSurfaceController?.hostStopped()
    remoteDshCoordinator?.hostStopped()
  },
  onRestarting: () => {
    dshProjector.pause()
  }
})
const dshProjections = new DshProjectionBridge({
  broadcast: broadcastAgentChannel
})
const dshProjector = new DshSessionProjector(dshHost, dshProjections)
const dshWire = new DshWireProxy(dshHost, broadcastToAllWindows)
let shutdownStarted = false
let winRef: BrowserWindow | null = null
let mainWindowRaiseSequence = 0
let shutdownPromise: Promise<void> | null = null
const pendingBridgeLaunches = new Map<string, (error: string | null) => void>()
const bridgeState = BridgeStateStore.inUserData(app.getPath('userData'))
const controlPlane = new OpenCodeControlPlane({
  discovery: cliDiscovery,
  runtime: agentRuntime,
  state: bridgeState,
  requireForegroundWindow: () => {
    const win = winRef && !winRef.isDestroyed() ? winRef : null
    if (!win) {
      throw BridgeError.unavailable('Agent Session Center window is not available')
    }
    if (!raiseMainWindow(win)) {
      throw BridgeError.unavailable(
        'Open the Agent Session Center window first (tray-only is not enough)'
      )
    }
  },
  launchVisible: async (request: BridgeLaunchRequest) => {
    const win = winRef && !winRef.isDestroyed() ? winRef : null
    if (!win || !canReceiveIpc(win.webContents)) {
      return 'Agent Session Center window is not available'
    }
    if (!raiseMainWindow(win)) {
      return 'Open the Agent Session Center window first (tray-only is not enough)'
    }
    try {
      const started = await agentRuntime.start({
        terminalId: request.terminalId,
        selection: request.selection,
        name: request.name,
        ...estimateTerminalSize(win)
      })
      if (
        !safeSend(win.webContents, AppEventChannel.BridgeLaunch, {
          ...request,
          ptyId: started.ptyId
        })
      ) {
        return 'Agent Session Center window is not available'
      }
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  },
  /**
   * 往已开着的终端写字（`session.send` 对 grok/codex/claude 的通道）。
   *
   * `PTYManager.write` 在找不到 pty 时是**静默 return** 的，所以存活性必须
   * 在这儿自己断言 —— 否则「写进了一个已经死掉的终端」会表现为成功。
   */
  writeTerminal: async (terminalId: string, data: string) => {
    const ptyId = await manager.ptyIdForTerminal(terminalId)
    if (!ptyId || !(await manager.isRunning(ptyId))) return false
    try {
      manager.write(ptyId, data)
      return true
    } catch (error) {
      console.warn('[bridge] writeTerminal failed:', error)
      return false
    }
  },
  /**
   * 终端里的程序起来了没 —— 只看「子进程有没有写过任何东西」。
   *
   * `lastOutputAt` 在 `PTYManager` 里是**每个 pty.onData 都会打点**的（不管有没有
   * 订阅者），所以它能当判据；如果哪天改成只有被人订阅才算，这里就会把所有会话
   * 永久判成没起来 —— 那时要换信号，不能放宽判据。
   */
  terminalReady: async (terminalId: string) => {
    const ptyId = await manager.ptyIdForTerminal(terminalId)
    if (!ptyId) return false
    return ((await manager.lastOutputAt(ptyId)) ?? 0) > 0
  },
  /**
   * 历史会话（只读）。走的是和会话历史页完全同一条扫描 —— 没有第二份实现，
   * 所以桥看到的场次数和 App 里看到的必然一致。`configurePricingCache` 在
   * 上面已经注入过 userData，价目表缓存路径不用在这里再管。
   */
  history: async () => (await discoverSessions()).sessions
})
const bridgeServer = new BridgeServer({
  userDataDir: app.getPath('userData'),
  plane: controlPlane,
  tasks: {
    listTasks: () => agentRuntime.listTasks(),
    listTaskQuestions: () => agentRuntime.listTaskQuestions(),
    answerTaskQuestion: (questionId, answer, answeredBy) =>
      agentRuntime.answerTaskQuestion(questionId, answer, answeredBy)
  }
})

function completeBridgeLaunch(ack: BridgeLaunchAck): void {
  const pending = pendingBridgeLaunches.get(ack.requestId)
  if (!pending) return
  pendingBridgeLaunches.delete(ack.requestId)
  pending(ack.error)
}

const remoteClient = new RemoteDesktopClient({
  sessions: combineRemoteSessionSources(
    runtimeSessionSource(agentRuntime),
    dshRemoteSessionSource(dshProjections)
  ),
  broadcast: (state) =>
    broadcastToAllWindows(RemoteEventChannel.StateChanged, state),
  pty: runtimeRemotePtyHost(agentRuntime, manager),
  launch: runtimeRemoteLaunchHost(cliDiscovery, agentRuntime, (request) => {
    const win = winRef && !winRef.isDestroyed() ? winRef : null
    if (!win) return
    safeSend(win.webContents, AppEventChannel.RemoteLaunch, request)
  }),
  workspace: runtimeRemoteWorkspaceHost(cliDiscovery),
  focusSession: (sessionId) => {
    const focused = floatingController?.focusSession(sessionId) ?? false
    const win = winRef && !winRef.isDestroyed() ? winRef : null
    if (win) raiseMainWindow(win)
    return focused
  },
  broadcastDrive: (state) =>
    broadcastToAllWindows(RemoteEventChannel.DriveChanged, state),
  onDshTunnelLease: (lease) => remoteDshCoordinator?.acceptLease(lease)
})

remoteDshCoordinator = new RemoteDshCoordinator({
  userDataDir: app.getPath('userData'),
  host: dshHost,
  remote: remoteClient,
  broadcast: (state) =>
    broadcastToAllWindows(RemoteEventChannel.DshStateChanged, state)
})

/**
 * 飞书渠道。
 *
 * `handlers`（把消息变成对会话的操作）在 `./feishu/router` 里，这一轮先留空 ——
 * 空着的时候连接照样建、心跳照样走，只是没人应答消息。这是刻意留的缝：
 * 「长连接真的活着」和「消息真的被处理了」是两件要分开验证的事。
 */
/** 会话历史的唯一来源：磁盘全扫（provision 同步和飞书路由共用同一份）。 */
const feishuHistory = async (): Promise<BridgeHistorySession[]> => {
  const result = await controlPlane.handle('sessions.history', { limit: 300 })
  return (result.kind === 'json' ? result.value : []) as BridgeHistorySession[]
}

/**
 * 每个 CLI 的可选模型清单（飞书「选模型再恢复」用）。
 * 来源：userData 下的 `feishu-models.json`（用户可自己加，如 grok 的中转模型 id）；
 * 没有这个文件时用内置默认 —— claude 的三个别名直接来自 --help 帮助文本（实测），
 * grok / codex 的模型 id 随中转配置变化，不好枚举，默认空 = 只有「默认」按钮。
 */
function feishuModelOptions(): (agent: string) => string[] {
  const defaults: Record<string, string[]> = { claude: ['sonnet', 'opus', 'haiku'] }
  return (agent: string) => {
    // 每次调用都重读：用户改 feishu-models.json 后下一发 /列表 就生效，不用重启。
    let custom: Record<string, string[]> = {}
    try {
      custom = JSON.parse(
        readFileSync(join(app.getPath('userData'), 'feishu-models.json'), 'utf8')
      ) as Record<string, string[]>
    } catch {
      // 没有自定义清单就用默认 —— 这是正常路径，不是错误。
    }
    const list = custom[agent] ?? defaults[agent] ?? []
    return Array.isArray(list) ? list.filter((m) => typeof m === 'string' && m.trim()) : []
  }
}

/**
 * 飞书入站路由：把消息和卡片按钮变成对会话的操作（/列表 /继续 /发 …）。
 * 准入名单在 service 里（pairedUsers），路由只管「接了之后干什么」。
 */
const feishuRouter = createFeishuRouter({
  history: feishuHistory,
  listActive: async () => {
    const result = await controlPlane.handle('sessions.list', {})
    return (result.kind === 'json' ? result.value : []) as BridgeSessionInfo[]
  },
  resume: async (sessionId, agent, model) => {
    const result = await controlPlane.handle('session.resume', {
      sessionId,
      ...(agent ? { agent } : {}),
      ...(model ? { model } : {})
    })
    if (result.kind !== 'json') throw new Error('resume 返回了 watch，不该发生')
    return result.value as BridgeResumeResult
  },
  getModels: feishuModelOptions(),
  send: async (sessionId, text, agent) => {
    const result = await controlPlane.handle('session.send', {
      sessionId,
      text,
      ...(agent ? { agent } : {})
    })
    if (result.kind !== 'json') throw new Error('send 返回了 watch，不该发生')
    return result.value as { accepted: true; mode: string }
  },
  sendTo: async (openId, message) => {
    await feishu.sendToOpenId(openId, message)
  },
  isPaired: (openId) => feishu.isPaired(openId),
  openLatestWorkbuddy: async () => {
    // 单独按 workbuddy 取 1 条。混在全部 CLI 的前 300 里会把国内会话挤掉。
    const result = await controlPlane.handle('sessions.history', {
      agent: 'workbuddy',
      limit: 1,
      refresh: true
    })
    const rows = (result.kind === 'json' ? result.value : []) as BridgeHistorySession[]
    const latest = rows[0]
    if (!latest?.sessionId) {
      return { ok: false, message: '这台电脑上还没有国内 WorkBuddy 会话。' }
    }
    return openDomesticWorkbuddy(latest.sessionId)
  },
  get fleet() {
    return feishu.fleetPort() ?? undefined
  },
  listTaskQuestions: async () => agentRuntime.listTaskQuestions(),
  answerTaskQuestion: (questionId, answer) =>
    agentRuntime.answerTaskQuestion(questionId, answer, 'feishu'),
  openDshSession: async () => {
    // 和 WorkBuddy 一样单取 1 条：混在全部 agent 的前 300 里会被挤掉。
    const result = await controlPlane.handle('sessions.history', {
      agent: 'dsh',
      limit: 1,
      refresh: true
    })
    const rows = (result.kind === 'json' ? result.value : []) as BridgeHistorySession[]
    const latest = rows[0]
    if (!latest?.sessionId) {
      return { ok: false, message: '这台电脑上还没有 DeepSeek Harness 会话。' }
    }
    // winRef 是主窗口的唯一引用处（本文件其余事件推送同样走它）。
    if (!winRef || winRef.isDestroyed()) {
      return { ok: false, message: '主窗口没开着，先在桌面上把 ASC 打开。' }
    }
    const window = winRef
    // dsh 的「恢复」发生在 ASC 自己的 DSH 界面里：把导航事件推给渲染进程，
    // 它会用 intent:'resume' 让官方界面打开这一场（见 DshPage）。
    if (
      !safeSend(window.webContents, AppEventChannel.OpenDshSession, {
        sessionId: latest.sessionId
      })
    ) {
      return { ok: false, message: '主窗口正在恢复，稍后再打开这一场。' }
    }
    return {
      ok: true,
      message: `已在 DSH 界面打开「${latest.title || latest.sessionId}」。`
    }
  }
})

const feishu = new FeishuService({
  store: FeishuStore.inUserData(app.getPath('userData')),
  broadcast: (status) => broadcastToAllWindows(FeishuEventChannel.StatusChanged, status),
  appName: 'Agent Session Center',
  appDescription: '在这台电脑上跑 AI 编程会话，并从飞书查看 / 继续它们。',
  // 入站应答：消息和卡片按钮 → feishuRouter（空着时连接照活，只是没人应答）。
  handlers: feishuRouter,
  // 连接成功后自动把会话历史同步进多维表格（对齐 agent-hub 的体验）。
  // 没有这两项时 maybeProvision 直接跳过 —— 只有连接没有引导是半成品。
  history: feishuHistory,
  bitableStatePath: join(app.getPath('userData'), 'feishu-bitable.json'),
  computerPath: join(app.getPath('userData'), 'feishu-computer.json'),
  computerFallbackName: hostname() || '这台电脑',
  onFleetCommand: (command) => feishuRouter.executeLocal(command)
})

const updateService = new UpdateService({
  // 打包版启动后自己检查并下载；排查与回归测试时可用 ASC_DISABLE_UPDATES=1 关掉。
  enabled: app.isPackaged && process.env.ASC_DISABLE_UPDATES !== '1',
  currentVersion: packageMetadata.version,
  driver: new ElectronUpdaterDriver(),
  autoDownload: true,
  initialCheckDelayMs: 0,
  broadcast: (snapshot) =>
    broadcastToAllWindows(UpdateEventChannel.StateChanged, snapshot),
  beforeInstall: () => prepareShutdown()
})

function prepareShutdown(): Promise<void> {
  if (shutdownPromise) return shutdownPromise
  shutdownStarted = true
  markQuitting()
  stopDigestScheduler()
  updateService.dispose()
  shutdownPromise = (async () => {
    // Agent Runtime 先写入退出事实并回收 observer；随后兜底关闭普通终端。
    controlPlane.dispose()
    remoteDshCoordinator?.dispose()
    remoteClient.dispose()
    // 飞书长连接要显式关：否则进程退出时 WS 还挂着，飞书那边会认为机器人还在线。
    await feishu.dispose()
    await bridgeServer.stop()
    await agentRuntime.disposeAll('stop')
    await hookIngress.dispose()
    dshProjector.stop()
    dshWire.dispose()
    dshSurfaceController?.dispose()
    dshSurfaceController = null
    await dshHost.dispose()
    floatingController?.dispose()
    workspaceReader.clear()
    await manager.shutdown()
    unregisterGlobalShortcut()
    stopThemeWatcher()
  })()
  return shutdownPromise
}

const attachDshSurface = (window: BrowserWindow): void => {
  dshSurfaceController?.dispose()
  const controller = new DshWebSurfaceController(window, dshHost, {
    activateSlot: (slotId, sessionId) =>
      dshProjector.activateSlot(slotId, sessionId),
    setActiveSession: (sessionId) => dshProjector.setActiveSession(sessionId),
    unfollow: (slotId) => dshProjector.unfollow(slotId)
  })
  dshSurfaceController = controller
  window.once('closed', () => {
    controller.dispose()
    if (dshSurfaceController === controller) dshSurfaceController = null
  })
}

const showWindow = (): void => {
  if (!winRef || winRef.isDestroyed()) return
  raiseMainWindow(winRef)
}

function estimateTerminalSize(win: BrowserWindow): { cols: number; rows: number } {
  const [width, height] = win.getContentSize()
  const scale = win.webContents.getZoomFactor() || 1
  const innerWidth = Math.max(480, width - 248)
  const innerHeight = Math.max(320, height - 96)
  return {
    cols: Math.max(80, Math.min(320, Math.floor(innerWidth / (8.5 * scale)))),
    rows: Math.max(24, Math.min(90, Math.floor(innerHeight / (17.5 * scale))))
  }
}

function raiseMainWindow(win: BrowserWindow): boolean {
  if (win.isDestroyed()) return false
  win.restore()
  win.show()
  if (process.platform === 'win32') {
    const sequence = ++mainWindowRaiseSequence
    let released = false
    let focusArmTimer: ReturnType<typeof setTimeout> | null = null
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null
    const releaseTopmost = (): void => {
      if (released || sequence !== mainWindowRaiseSequence) return
      released = true
      if (focusArmTimer) clearTimeout(focusArmTimer)
      if (fallbackTimer) clearTimeout(fallbackTimer)
      win.removeListener('focus', releaseAfterFocus)
      if (win.isDestroyed()) return
      win.setAlwaysOnTop(false)
      win.moveTop()
    }
    const releaseAfterFocus = (): void => {
      setTimeout(releaseTopmost, 250)
    }
    try {
      win.setAlwaysOnTop(true)
      win.moveTop()
      app.focus({ steal: true })
      win.focus()
    } catch {
      try {
        win.focus()
      } catch {
        // The fallback timer below still releases a successfully applied topmost state.
      }
    }
    focusArmTimer = setTimeout(() => {
      if (released || sequence !== mainWindowRaiseSequence || win.isDestroyed()) return
      win.once('focus', releaseAfterFocus)
    }, 500)
    fallbackTimer = setTimeout(releaseTopmost, 10_000)
  } else {
    win.focus()
  }
  return win.isVisible()
}

if (!cliArgv && !isPrimaryInstance) {
  app.quit()
} else if (isPrimaryInstance) {
  app.on('second-instance', showWindow)
}

if (isPrimaryInstance) app.whenReady().then(async () => {
  // M0 验收：抵达此行即证明 node-pty 已按 Electron ABI 成功加载
  console.log('[asc] app ready; node-pty loaded against Electron ABI OK')
  try {
    mkdirSync(join(app.getPath('userData'), 'logs'), { recursive: true })
  } catch {
    /* ignore */
  }

  const prefs = await loadMainPrefs()
  await eventLog.init()

  let trayRef: Tray | null = null

  const trayCallbacks: TrayCallbacks = {
    toggleWindow: () => {
      if (winRef && !winRef.isDestroyed()) toggleWindowVisibility(winRef)
    },
    showWindow,
    openNewSession: () => {
      if (winRef && !winRef.isDestroyed()) {
        safeSend(winRef.webContents, AppEventChannel.OpenNewSession)
      }
    },
    quit: () => {
      markQuitting()
      app.quit()
    }
  }

  const ctx: IpcContext = {
    diagnosticLog,
    eventLog,
    cliDiscovery,
    agentRuntime,
    sessionLedger,
    projects: projectStore,
    workspaceReader,
    dshHost,
    dshWire,
    dshProjections,
    updateService,
    remoteClient,
    remoteDshCoordinator,
    feishu,
    getDshSurfaceController: () => dshSurfaceController,
    getWindow: () => (winRef && !winRef.isDestroyed() ? winRef : null),
    getTray: () => trayRef,
    getFloatingWindowController: () => floatingController,
    rebuildTrayMenu: () => {
      if (trayRef) rebuildTrayMenu(trayRef, getMainPrefs().language, trayCallbacks)
    },
    completeBridgeLaunch
  }

  registerIpc(manager, ctx)
  startDigestScheduler(app.getPath('userData'))
  // 飞书凭据若已存在就立刻建连。刻意不 await：读盘+建连都不该挡住窗口出现，
  // 而 initialize 内部已经把失败收敛成状态字段，晚到的状态会用广播补上。
  void feishu.initialize()
  // 启动即开始自动检查更新，不依赖窗口/设置页/托盘初始化完成。
  updateService.startAutomaticChecks()
  try {
    await bridgeServer.start()
  } catch (error) {
    // Official and Dev share \\.\pipe\asc-bridge-<user>. A busy pipe must
    // not block the window — skip-approval / TUI still work without the bridge.
    console.warn('[asc] bridge listen failed; continuing without it', error)
  }
  const openMainWindow = (): BrowserWindow => {
    const win = createWindow(prefs)
    winRef = win
    attachDshSurface(win)
    attachMainRendererRecovery(win, {
      isQuitting,
      log: (message) => diagnosticLog.append('error', 'main', message),
      hideDshSurface: () => {
        try {
          dshSurfaceController?.hide()
        } catch {
          // 窗口正在拆时隐藏 DSH 表面可以失败，恢复流程继续。
        }
      },
      killPtyChildren: () => {
        manager.killAll()
      },
      disposeAgentSessions: () => agentRuntime.disposeAll('stop'),
      onGaveUp: (summary) => {
        if (isQuitting() || process.env['ASC_E2E']) return
        const isZh = app.getLocale().startsWith('zh')
        dialog.showErrorBox(
          isZh
            ? 'Agent Session Center 界面无法恢复'
            : 'Agent Session Center could not restore the window',
          isZh
            ? `主窗口连续崩溃，已停止自动重载。这次带起来的终端已经退出，避免同一场会话再把页面打崩。\n\n${summary}\n\n诊断日志：\n${diagnosticLogPath}`
            : `The main window crashed repeatedly, so automatic reload stopped. Terminals from that page were closed so the same session is not replayed into a broken page.\n\n${summary}\n\nDiagnostic log:\n${diagnosticLogPath}`
        )
      }
    })
    return win
  }
  const mainWindow = openMainWindow()
  floatingController = new ElectronFloatingWindowController({
    getMainWindow: () =>
      winRef && !winRef.isDestroyed() ? winRef : null,
    listActiveSessions: () => [
      ...agentRuntime.listActive(),
      ...dshProjections.listActive()
    ],
    renderersDirectory: join(
      app.getPath('userData'),
      'floating-renderers'
    ),
    builtinRendererRoot: join(__dirname, '../renderer')
  })
  await floatingController.setEnabled(prefs.floatingWindowEnabled)
  trayRef = createTray(prefs.language, trayCallbacks)
  if (prefs.globalShortcutEnabled) {
    registerGlobalShortcut(mainWindow)
  }
  startThemeWatcher()

  // E2E：主进程调试钩子（托盘菜单点击 / 快捷键注册状态无法从 renderer 注入）。
  if (process.env['ASC_E2E']) {
    ;(globalThis as Record<string, unknown>)['__ascMainDebug'] = {
      hasTray: () => Boolean(trayRef),
      isWindowVisible: () => Boolean(winRef && !winRef.isDestroyed() && winRef.isVisible()),
      isWindowDestroyed: () => Boolean(winRef?.isDestroyed()),
      isShortcutRegistered: () => isGlobalShortcutRegistered(),
      forceUpdateAvailable: (version: unknown, releaseNotes: unknown) => {
        if (typeof version !== 'string' || !version.trim()) return false
        updateService.debugSetAvailable(
          version.trim(),
          typeof releaseNotes === 'string' ? releaseNotes : null
        )
        return true
      },
      forceUpdateDownloaded: (version: unknown, releaseNotes: unknown) => {
        if (typeof version !== 'string' || !version.trim()) return false
        updateService.debugSetDownloaded(
          version.trim(),
          typeof releaseNotes === 'string' ? releaseNotes : null
        )
        return true
      },
      toggleWindow: () => {
        if (winRef && !winRef.isDestroyed()) toggleWindowVisibility(winRef)
      },
      clickTrayItem: (index: number) => {
        const result = clickTrayMenuItem(index)
        return {
          ...trayMenuState(),
          invoked: result,
          visible: Boolean(winRef && !winRef.isDestroyed() && winRef.isVisible()),
          focused: Boolean(winRef && !winRef.isDestroyed() && winRef.isFocused())
        }
      },
      openNewSession: () => {
        if (winRef && !winRef.isDestroyed()) {
          safeSend(winRef.webContents, AppEventChannel.OpenNewSession)
        }
      },
      dshSurfaceSnapshot: () => dshSurfaceController?.snapshot() ?? null,
      dshSurfaceInspect: () => dshSurfaceController?.inspect() ?? null,
      dshSurfaceDismissOnboarding: () =>
        dshSurfaceController?.dismissOnboardingForTest() ?? false,
      dshSurfaceSelectSession: (sessionId: unknown) =>
        dshSurfaceController?.selectSessionForTest(sessionId) ?? false,
      floatingWindowInspect: () => floatingController?.inspect() ?? null,
      floatingWindowSetEnabled: (enabled: unknown) =>
        typeof enabled === 'boolean'
          ? floatingController?.setEnabled(enabled) ?? null
          : null,
      floatingWindowSetRenderer: (rendererId: unknown) =>
        typeof rendererId === 'string'
          ? floatingController?.setRenderer(rendererId) ?? null
          : null,
      floatingWindowRefreshRenderers: () =>
        floatingController?.refreshRenderers() ?? null,
      floatingWindowPublishProjection: (projection: unknown) => {
        if (
          projection &&
          typeof projection === 'object' &&
          typeof (projection as { sessionId?: unknown }).sessionId === 'string'
        ) {
          floatingController?.publishProjection(
            projection as Parameters<
              FloatingWindowController['publishProjection']
            >[0]
          )
          return true
        }
        return false
      }
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openMainWindow()
    } else {
      showWindow()
    }
  })
})

if (isPrimaryInstance) app.on('before-quit', (event) => {
  if (shutdownStarted) return
  event.preventDefault()
  void prepareShutdown().then(() => app.quit())
})
