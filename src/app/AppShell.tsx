import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type {
  CliScanReport,
  FeishuStatus,
  RemoteDriveState,
  ProjectFilePayload,
  ProjectSummary,
  ShellOption,
  UpdateSnapshot
} from '../../shared/ipc-contract'
import {
  FEISHU_IDLE_STATUS,
  REMOTE_DRIVE_IDLE_STATE,
  projectOwnsSession
} from '../../shared/ipc-contract'
import type { AgentEvent } from '../../shared/agent-events'
import type {
  DshRuntimeScanReport,
  DshSurfaceSnapshot
} from '../../shared/dsh-ipc'
import { readWorkspaceHistory, saveWorkspace } from './workspaceHistory'
import TitleBar from './TitleBar'
import Sidebar from './Sidebar'
import IconRail from './IconRail'
import TerminalPage from './TerminalPage'
import HomePage from './HomePage'
import SettingsPage, { type SettingsCategory } from './SettingsPage'
import DshPage from './DshPage'
import SessionHistoryPage from './SessionHistoryPage'
import { formatArgs, planFork, planResume } from '../../shared/session-resume'
import type { AgentId, HistorySession } from '../../shared/session-history'
import type { SessionLedgerRow } from '../../shared/session-ledger'
import type { TaskQuestionRow } from '../../shared/task-ledger'
import UsagePage from './UsagePage'
import NewSessionFlow from './NewSessionFlow'
import CloseSessionDialog from './CloseSessionDialog'
import NewProjectDialog from './NewProjectDialog'
import UpdateAvailableModal from './UpdateAvailableModal'
import TargetCursor from './effects/TargetCursor'
import SidebarTint from './SidebarTint'
import {
  dshSlotIdFromPage,
  dshSlotPage,
  isDshPage,
  isPageId,
  sessionPage,
  terminalIdFromPage,
  terminalPage,
  type PageId
} from './pages'
import {
  renameVisibleDshSession,
  unfollowVisibleDshSlot
} from '../dsh/sessionSync'
import {
  handleShellShortcut,
  registerShellShortcutActions
} from './shellShortcuts'
import { useStrings } from './i18n'
import {
  buildCliLaunchSelection,
  findDefaultShell,
  type CliLaunchDraft,
  type CliOption
} from './launchOptions'
import { useSettingsStore, type NavMode } from '../state/settingsStore'
import { useSessionsStore, type SessionEntry } from '../state/sessionsStore'
import { getTerminalLaunch } from '../state/terminalLaunchRegistry'
import { useAgentEventsStore } from '../state/agentEventsStore'
import { useTerminalsStore } from '../state/terminalsStore'
import { useWorkspaceReaderStore } from '../workspace-reader/workspaceReaderStore'
import { planChildTerminal } from './childTerminal'
import { projectSessionNavigation } from '../session-navigation/sessionNavigation'
import { useSessionNavigationStore } from '../session-navigation/sessionNavigationStore'
import { playNotificationSound } from '../state/notificationSound'
import { parseJoinUrl } from '../../shared/remote-protocol'

/**
 * 新建会话面板这次是为什么开的。
 *
 * `cli` 分支带 `args`：从历史会话「继续」时把 `--resume <id>` 预填进去 ——
 * 而且只在**原目录已经不存在**时才走这条路（否则直接启动，不打扰）。
 * 那种情况等于让用户换一个目录续一场旧会话，命令必须让他过一眼。
 */
type NewSessionIntent =
  | { kind: 'sheet'; workspace?: string }
  | { kind: 'terminal' }
  | {
      kind: 'cli'
      option: CliOption
      args?: string
      skipApproval?: boolean
      /** 预填的工作目录。恢复时必须是**旧目录原值**，理由见 resumeSession。 */
      workspace?: string
      /** 面板顶部的提示条，用来说明这次为什么要重选目录。 */
      notice?: string
    }

export interface ASCDebugShellApi {
  navigate(pageId: PageId): void
  openNewSession(): void
  setNavMode(mode: NavMode): void
  agentEvents(): AgentEvent[]
  agentSessions(): SessionEntry[]
}

interface PendingCliLaunch {
  draft: CliLaunchDraft
  previousPage: PageId
  resolve: (error: string | null) => void
}

interface PendingBridgeLaunch {
  requestId: string
  previousPage: PageId
}

/**
 * 侧栏 SessionEntry.adapterId（CLI definition 的 adapterId）→ 分叉判断用的
 * AgentId。claude 的 definition adapterId 是 `claude-code`，不是 AgentId 里的
 * `claude`，不映射就会静默漏掉所有 Claude 会话；grok 同名。codex 能恢复但
 * 实测不支持 `--fork-session`，不在这张表里（铁律见 shared/session-resume.ts）。
 */
const FORK_ADAPTER_AGENTS: Partial<Record<string, AgentId>> = {
  'claude-code': 'claude',
  grok: 'grok'
}

export default function AppShell() {
  const [pageId, setPageId] = useState<PageId>('home')
  const [settingsCategory, setSettingsCategory] =
    useState<SettingsCategory>('appearance')
  const [updateSnapshot, setUpdateSnapshot] =
    useState<UpdateSnapshot | null>(null)
  const [updateModalReady, setUpdateModalReady] = useState(false)
  const [updateModalVersion, setUpdateModalVersion] =
    useState<string | null>(null)
  const [updateModalReleaseNotes, setUpdateModalReleaseNotes] =
    useState<string | null>(null)
  const [updateModalDismissedVersion, setUpdateModalDismissedVersion] =
    useState<string | null>(null)
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [remoteDrive, setRemoteDrive] = useState<RemoteDriveState>(
    REMOTE_DRIVE_IDLE_STATE
  )
  /**
   * 飞书连接状态。
   *
   * 提到 AppShell 是因为**标题栏要显示状态灯** —— 不点开设置就能看出
   * 「连没连上」。和设置面板订阅的是同一路广播，两处永远不会各说各话。
   */
  const [feishuStatus, setFeishuStatus] =
    useState<FeishuStatus>(FEISHU_IDLE_STATUS)
  const [pendingCloseSession, setPendingCloseSession] =
    useState<SessionEntry | null>(null)
  const [newSessionIntent, setNewSessionIntent] = useState<NewSessionIntent>({
    kind: 'sheet'
  })
  // 恢复失败时要给用户一句人话，所以这里也得有一份文案。
  const strings = useStrings()
  const [shells, setShells] = useState<readonly ShellOption[]>([])
  const [cliReport, setCliReport] = useState<CliScanReport | null>(null)
  const [cliScanning, setCliScanning] = useState(true)
  const [cliScanError, setCliScanError] = useState<string | null>(null)
  const [relaunchRows, setRelaunchRows] = useState<SessionLedgerRow[]>([])
  const [liveSessionIds, setLiveSessionIds] = useState<string[]>([])
  const [openQuestions, setOpenQuestions] = useState<TaskQuestionRow[]>([])
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({})
  const [relaunchNotice, setRelaunchNotice] = useState<string | null>(null)
  const [dshRuntimeReport, setDshRuntimeReport] =
    useState<DshRuntimeScanReport | null>(null)
  const [dshRuntimeScanning, setDshRuntimeScanning] = useState(true)
  const [dshRuntimeScanError, setDshRuntimeScanError] =
    useState<string | null>(null)
  const [dshRestarting, setDshRestarting] = useState(false)
  const [dshRestartSnapshot, setDshRestartSnapshot] =
    useState<DshSurfaceSnapshot | null>(null)
  const pendingCliLaunches = useRef(new Map<string, PendingCliLaunch>())
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [pendingProject, setPendingProject] = useState<{
    cwd: string
    defaultName: string
  } | null>(null)
  // 打开的项目和它读出来的笔记绑在一起：只留一份状态，回首页时一起清掉。
  const [openedProject, setOpenedProject] = useState<{
    id: string
    file: ProjectFilePayload
  } | null>(null)
  const [handoffDraft, setHandoffDraft] = useState<{
    session: SessionEntry
    projectId: string
    agentId: string
    brief: string
    returning: boolean
  } | null>(null)
  // 还没拿到钥匙的终端，等钥匙到了再挂进项目。按终端记，
  // 取消新建或启动失败时按终端清掉，不会挂到下一个会话上。
  const pendingProjectAssign = useRef(new Map<string, string>())
  const pendingBridgeLaunches = useRef(new Map<string, PendingBridgeLaunch>())
  const navMode = useSettingsStore((state) => state.navMode)
  const setNavMode = useSettingsStore((state) => state.setNavMode)
  const terminalRounded = useSettingsStore((state) => state.terminalRounded)
  const targetCursorEnabled = useSettingsStore(
    (state) => state.targetCursorEnabled
  )
  const defaultTerminal = useSettingsStore((state) => state.defaultTerminal)
  const setDefaultTerminal = useSettingsStore(
    (state) => state.setDefaultTerminal
  )
  const ignoredUpdateVersion = useSettingsStore(
    (state) => state.ignoredUpdateVersion
  )
  const ignoreUpdateVersion = useSettingsStore(
    (state) => state.ignoreUpdateVersion
  )
  const updateModalDisabled = useSettingsStore(
    (state) => state.updateModalDisabled
  )
  const setUpdateModalDisabled = useSettingsStore(
    (state) => state.setUpdateModalDisabled
  )
  const sessions = useSessionsStore((state) => state.sessions)
  const sessionNavigation = useSessionNavigationStore(
    (state) => state.snapshot
  )
  const sessionNavigationRecoveryComplete = useSessionNavigationStore(
    (state) => state.recoveryComplete
  )
  const navigationSessions = useMemo(
    () => projectSessionNavigation(sessionNavigation, sessions),
    [sessionNavigation, sessions]
  )
  const removeSession = useSessionsStore((state) => state.removeSession)
  const updateSession = useSessionsStore((state) => state.updateSession)
  const terminals = useTerminalsStore((state) => state.terminals)
  const addTerminal = useTerminalsStore((state) => state.addTerminal)
  const restoreTerminals = useTerminalsStore((state) => state.restoreTerminals)
  const activateTerminal = useTerminalsStore((state) => state.activateTerminal)
  const closeTerminal = useTerminalsStore((state) => state.closeTerminal)
  const markTerminalExited = useTerminalsStore((state) => state.markExited)

  useEffect(() => {
    let cancelled = false
    const parsed = parseJoinUrl(useSettingsStore.getState().remoteJoinUrl)
    if (!parsed.ok) return

    void window.remoteApi.getState().then((state) => {
      if (
        cancelled ||
        (state.phase !== 'idle' && state.phase !== 'error')
      ) {
        return
      }
      void window.remoteApi.connect(parsed.value.href)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void window.agentApi.listLiveAttached().then((rows) => {
      if (cancelled || rows.length === 0) return
      const recoverable = rows
        .filter((row) => row.hostPtyId && row.terminalId)
        .map((row) => ({
          ptyId: row.hostPtyId as string,
          terminalId: row.terminalId as string,
          kind: 'agent' as const,
          name: row.name,
          shellId: row.agentId,
          cwd: row.cwd,
          exited: false
        }))
      if (recoverable.length > 0) restoreTerminals(recoverable)
      setLiveSessionIds(rows.map((row) => row.id))
    })
    void window.agentApi.listResumeOnLaunch().then((rows) => {
      if (!cancelled) setRelaunchRows(rows)
    })
    void window.agentApi.listTaskQuestions().then((rows) => {
      if (!cancelled) setOpenQuestions(rows)
    })
    return () => {
      cancelled = true
    }
  }, [restoreTerminals])

  useEffect(() => {
    let cancelled = false
    void window.shellApi.listAvailable().then((available) => {
      if (!cancelled) setShells(available)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const unsubscribe = window.remoteApi.onDriveStateChange((state) => {
      if (!cancelled) setRemoteDrive(state)
    })
    void window.remoteApi.getDriveState().then((state) => {
      if (!cancelled) setRemoteDrive(state)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const unsubscribe = window.feishuApi.onStatusChange((status) => {
      if (!cancelled) setFeishuStatus(status)
    })
    void window.feishuApi.getStatus().then((status) => {
      if (!cancelled) setFeishuStatus(status)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const scanClis = useCallback(async (force = false): Promise<void> => {
    setCliScanning(true)
    setCliScanError(null)
    try {
      setCliReport(await window.cliApi.scan(force))
    } catch (error) {
      setCliScanError(error instanceof Error ? error.message : String(error))
    } finally {
      setCliScanning(false)
    }
  }, [])

  const scanDshRuntimes = useCallback(async (force = false): Promise<void> => {
    setDshRuntimeScanning(true)
    setDshRuntimeScanError(null)
    try {
      setDshRuntimeReport(await window.dshApi.scanRuntimes(force))
    } catch (error) {
      setDshRuntimeScanError(error instanceof Error ? error.message : String(error))
    } finally {
      setDshRuntimeScanning(false)
    }
  }, [])

  const restartDshHost = useCallback(async (): Promise<void> => {
    if (dshRestarting) return
    setDshRestarting(true)
    try {
      const snapshot = await window.dshSurfaceApi.restart()
      setDshRestartSnapshot(snapshot)
    } catch (error) {
      setDshRestartSnapshot({
        phase: 'failed',
        visible: false,
        error: error instanceof Error ? error.message : String(error)
      })
      console.error('[dsh] host restart failed', error)
    } finally {
      setDshRestarting(false)
    }
  }, [dshRestarting])

  useEffect(() => {
    void scanClis(false)
    void scanDshRuntimes(false)
  }, [scanClis, scanDshRuntimes])

  // 全局跟踪更新状态：启动后即使不打开设置页也能在标题栏看到新版本提示。
  useEffect(() => {
    let cancelled = false
    const unsubscribe = window.updateApi.onStateChanged((snapshot) => {
      if (!cancelled) setUpdateSnapshot(snapshot)
    })
    void window.updateApi.getState().then((snapshot) => {
      if (!cancelled) setUpdateSnapshot(snapshot)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  // 安装包下完，且用户未忽略、未在本会话稍后关闭时，弹出重启安装确认。
  useEffect(() => {
    if (updateModalDisabled) return
    if (updateSnapshot?.phase !== 'downloaded' || !updateSnapshot.availableVersion) {
      return
    }
    const version = updateSnapshot.availableVersion
    if (
      ignoredUpdateVersion === version ||
      updateModalDismissedVersion === version
    ) {
      return
    }
    setUpdateModalReady(true)
    setUpdateModalVersion(version)
    setUpdateModalReleaseNotes(updateSnapshot.releaseNotes)
  }, [
    updateSnapshot,
    ignoredUpdateVersion,
    updateModalDismissedVersion,
    updateModalDisabled
  ])

  const terminalIds = useMemo(
    () => new Set(terminals.map((terminal) => terminal.id)),
    [terminals]
  )
  const nonSessionTerminals = useMemo(() => {
    const sessionTerminalIds = new Set(
      sessions.map((session) => session.terminalId)
    )
    return terminals.filter((terminal) => !sessionTerminalIds.has(terminal.id))
  }, [sessions, terminals])
  const standaloneTerminals = useMemo(
    () => nonSessionTerminals.filter((terminal) => !terminal.parentSessionId),
    [nonSessionTerminals]
  )
  const childTerminals = useMemo(
    () => nonSessionTerminals.filter((terminal) => terminal.parentSessionId),
    [nonSessionTerminals]
  )
  const activeTerminalId = terminalIdFromPage(pageId)
  const activeDshSlotId = dshSlotIdFromPage(pageId)
  const activeDshAdapterSessionId = activeDshSlotId
    ? sessions.find(
        (session) =>
          session.kind === 'dsh' && session.sessionId === activeDshSlotId
      )?.adapterSessionId
    : undefined
  const activeReaderTerminal = activeTerminalId
    ? (terminals.find((terminal) => terminal.id === activeTerminalId) ?? null)
    : null
  const activeHasWorkspace =
    Boolean(activeReaderTerminal?.cwd) &&
    sessions.some((session) => session.terminalId === activeTerminalId)
  const activeReaderOpen = useWorkspaceReaderStore((state) =>
    activeTerminalId ? (state.sessions[activeTerminalId]?.open ?? false) : false
  )
  const setReaderOpen = useWorkspaceReaderStore((state) => state.setOpen)
  const updateBadge =
    updateSnapshot &&
    (updateSnapshot.phase === 'available' ||
      updateSnapshot.phase === 'downloading' ||
      updateSnapshot.phase === 'downloaded' ||
      (updateSnapshot.phase === 'error' && updateSnapshot.availableVersion)) &&
    updateSnapshot.availableVersion &&
    updateSnapshot.availableVersion !== ignoredUpdateVersion
      ? updateSnapshot.availableVersion
      : null

  const closeUpdateModal = (): void => {
    if (updateModalVersion) {
      setUpdateModalDismissedVersion(updateModalVersion)
    }
    setUpdateModalVersion(null)
  }

  const ignoreUpdateModal = (): void => {
    if (updateModalVersion) {
      ignoreUpdateVersion(updateModalVersion)
      setUpdateModalDismissedVersion(updateModalVersion)
    }
    setUpdateModalVersion(null)
  }

  const neverUpdateModal = (): void => {
    setUpdateModalDisabled(true)
    if (updateModalVersion) {
      setUpdateModalDismissedVersion(updateModalVersion)
    }
    setUpdateModalVersion(null)
  }

  const applyUpdateModal = (): void => {
    if (updateModalVersion) {
      setUpdateModalDismissedVersion(updateModalVersion)
    }
    setUpdateModalVersion(null)
    const action = updateModalReady
      ? window.updateApi.install()
      : window.updateApi.download()
    void action.catch(() => {})
  }

  const navigate = useCallback(
    (nextPage: PageId): void => {
      // The old custom DSH settings route no longer owns a page. Existing dev
      // links land on the complete official Web app instead.
      const destination =
        nextPage === 'dsh:settings' || nextPage === 'dsh:home'
          ? ('home' as const)
          : nextPage
      const terminalId = terminalIdFromPage(destination)
      if (terminalId && terminalIds.has(terminalId)) {
        activateTerminal(terminalId)
      }
      // 回首页就是首页：没这项清空，项目页会一直占着 home 位，再也回不到起始页。
      if (destination === 'home') setOpenedProject(null)
      setPageId(destination)
    },
    [activateTerminal, terminalIds]
  )

  const openNewSession = useCallback((): void => {
    setNewSessionIntent({ kind: 'sheet' })
    setNewSessionOpen(true)
  }, [])

  const openDshSlot = useCallback((): void => {
    navigate(dshSlotPage(crypto.randomUUID()))
  }, [navigate])

  /**
   * 会话历史页里点 dsh 场次：直接导航到它的 DSH 跟踪位。
   * 页面 id 里的就是 dsh 自己的 session id（`dshSlotIdFromPage` 原样取出），
   * 于是 DshPage 会用 `intent: 'resume'` 让官方界面打开这一场。
   */
  const openDshHistorySession = useCallback(
    (session: { id: string }): void => {
      if (!session.id) return
      navigate(dshSlotPage(session.id))
    },
    [navigate]
  )

  const openDshFromNewSession = useCallback((): void => {
    setNewSessionOpen(false)
    setNewSessionIntent({ kind: 'sheet' })
    openDshSlot()
  }, [openDshSlot])

  // 飞书 /dsh：在 DSH 界面打开指定的一场 dsh 会话。
  useEffect(() => {
    return window.appApi.onOpenDshSession((payload) => {
      // 飞书推过来的是 { sessionId }，而历史页用的是 HistorySession（字段名 id），
      // 这里做个显式映射，别让两种 payload 形状在半路打架。
      openDshHistorySession({ id: payload.sessionId })
    })
  }, [openDshHistorySession])

  // 托盘「新建会话」菜单：与 Ctrl+Shift+T 同路径。
  useEffect(() => {
    return window.appApi.onOpenNewSession(openNewSession)
  }, [openNewSession])

  useEffect(() => {
    return window.appApi.onBridgeLaunch((request) => {
      pendingBridgeLaunches.current.set(request.terminalId, {
        requestId: request.requestId,
        previousPage: pageId
      })
      addTerminal({
        id: request.terminalId,
        name: request.name,
        // 主进程发起的启动可能是任意 adapter（桥的 session.resume 就能起
        // grok/codex/claude）。写死 'opencode' 会让这些终端挂上错误的 shell
        // 定义；`adapterId` 也带的时候以它为准。
        shellId: request.adapterId ?? 'opencode',
        cwd: request.workspace,
        launch: request.ptyId
          ? { kind: 'attach', ptyId: request.ptyId, agent: true }
          : {
              kind: 'agent',
              selection: {
                installationId: request.selection.installationId,
                workspace: request.selection.workspace,
                args: [...request.selection.args]
              },
              name: request.name
            }
      })
      setPageId(terminalPage(request.terminalId))
    })
  }, [addTerminal, pageId])

  useEffect(() => {
    void window.remoteApi.setRecentWorkspaces(readWorkspaceHistory())
  }, [])

  useEffect(() => {
    return window.appApi.onRemoteLaunch((request) => {
      addTerminal({
        id: request.terminalId,
        name: request.name,
        shellId: request.adapterId,
        cwd: request.workspace,
        launch: { kind: 'attach', ptyId: request.ptyId, agent: true }
      })
      const history = saveWorkspace(request.workspace)
      void window.remoteApi.setRecentWorkspaces(history)
      setPageId(terminalPage(request.terminalId))
    })
  }, [addTerminal])

  useEffect(() => {
    return window.appApi.onFocusSession(({ sessionId, terminalId }) => {
      const session = useSessionsStore
        .getState()
        .sessions.find((item) => item.sessionId === sessionId)
      if (session) {
        navigate(sessionPage(session))
        return
      }
      if (
        useTerminalsStore
          .getState()
          .terminals.some((terminal) => terminal.id === terminalId)
      ) {
        navigate(terminalPage(terminalId))
      } else {
        navigate('home')
      }
    })
  }, [navigate])

  const launchTerminal = useCallback(
    (shell: ShellOption, remember = false): void => {
      if (remember) setDefaultTerminal(shell.id)
      const terminal = addTerminal({
        shellId: shell.id,
        launch: {
          kind: 'shell',
          shell: {
            shell: shell.shell,
            args: shell.args
          }
        }
      })
      setNewSessionOpen(false)
      setPageId(terminalPage(terminal.id))
    },
    [addTerminal, setDefaultTerminal]
  )

  const launchDefaultTerminal = useCallback((): void => {
    const shell = findDefaultShell(shells, defaultTerminal)
    if (shell) launchTerminal(shell)
  }, [defaultTerminal, launchTerminal, shells])

  const renameSession = useCallback(
    (sessionId: string, name: string): void => {
      const session = useSessionsStore
        .getState()
        .sessions.find((item) => item.sessionId === sessionId)
      if (session?.kind === 'dsh') {
        if (session.adapterSessionId) {
          void renameVisibleDshSession(
            sessionId,
            session.adapterSessionId,
            name
          ).catch(() => {
            updateSession(sessionId, { name })
          })
        } else {
          updateSession(sessionId, { name })
        }
        return
      }
      updateSession(sessionId, { name })
      void window.agentApi.rename(sessionId, name).then((projection) => {
        if (projection) {
          useSessionsStore.getState().applyProjection(projection)
        }
      })
    },
    [updateSession]
  )

  const cloneSession = useCallback(
    (session: SessionEntry): void => {
      if (session.kind === 'dsh') return
      const source = useTerminalsStore
        .getState()
        .terminals.find((terminal) => terminal.id === session.terminalId)
      if (!source?.agentSelection) return

      const selection = {
        ...source.agentSelection,
        args: [...source.agentSelection.args]
      }
      const terminal = addTerminal({
        shellId: source.shellId,
        cwd: selection.workspace,
        launch: {
          kind: 'agent',
          selection,
          name: session.name
        }
      })
      setPageId(terminalPage(terminal.id))
    },
    [addTerminal]
  )

  const createChildTerminal = useCallback(
    async (session: SessionEntry): Promise<void> => {
      if (session.kind === 'dsh' || !session.installationId) return
      try {
        const report = cliReport ?? (await window.cliApi.scan(false))
        if (!cliReport) setCliReport(report)
        const installation = report.launchable
          .flatMap((cli) => cli.installations)
          .find((candidate) => candidate.id === session.installationId)
        if (!installation) return

        const parent = useTerminalsStore
          .getState()
          .terminals.find((terminal) => terminal.id === session.terminalId)
        const workspace = parent?.cwd.trim()
        if (!workspace) return

        const availableShells =
          shells.length > 0 ? shells : await window.shellApi.listAvailable()
        const plan = planChildTerminal({
          runtime: installation.runtime,
          workspace,
          shells: availableShells,
          defaultShellId: defaultTerminal
        })
        if (!plan) return

        const terminal = addTerminal({
          shellId: plan.shellId,
          cwd: plan.cwd,
          parentSessionId: session.sessionId,
          launch: { kind: 'shell', shell: plan.shell }
        })
        setPageId(terminalPage(terminal.id))
      } catch {
        // Losing a runtime while creating the terminal leaves the session intact.
      }
    },
    [addTerminal, cliReport, defaultTerminal, shells]
  )

  // S1：AI CLI 启动编排在主进程 AgentSessionRuntime 完成；renderer 只建立
  // provisional terminal 并保存 CliLaunchSelection，TerminalView fit 后调用
  // agent:start。会话展示副本由主进程 projection 广播 upsert，不再本地推导。
  const launchCli = useCallback(
    async (draft: CliLaunchDraft): Promise<string | null> => {
      let workspace: string
      try {
        workspace = await window.cliApi.resolveWorkspace(
          draft.installationId,
          draft.workspace
        )
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
      const effectiveDraft = { ...draft, workspace }
      const name = draft.name.trim() || draft.option.definition.displayName
      const terminal = addTerminal({
        shellId: draft.option.definition.adapterId,
        cwd: workspace,
        launch: {
          kind: 'agent',
          selection: buildCliLaunchSelection(effectiveDraft),
          name
        }
      })
      setPageId(terminalPage(terminal.id))
      // 项目页点了「在此项目新建」后，把这个终端记下来，钥匙到了再挂。
      if (openedProject) {
        pendingProjectAssign.current.set(terminal.id, openedProject.id)
      }
      return new Promise<string | null>((resolve) => {
        pendingCliLaunches.current.set(terminal.id, {
          draft: effectiveDraft,
          previousPage: pageId,
          resolve
        })
      })
    },
    [addTerminal, pageId]
  )

  /**
   * 从一条历史会话接着干。
   *
   * 复用 `launchCli` 的整条链路：恢复不是什么特殊启动，就是一个「参数里写着
   * resume、目录是旧目录」的新会话，这样 hook/env 注入、PTY、terminal 条目、
   * 状态灯全都自动对上，不用另建一套。
   *
   * 唯一的岔路是**原目录没了**（claude 那两场 Temp 会话就是）。`resolveWorkspace`
   * 会在目录不存在时抛错（主进程 `assertDirectory`），这时不报错收场，而是把
   * 新建面板打开、参数预填好、目录留空让用户选 —— 能力不丢，只是多一步。
   */
  const resumeSession = useCallback(
    async (session: HistorySession, option: CliOption): Promise<string | null> => {
      const plan = planResume(session)
      if (!plan.ok) return null
      const probe = await window.agentApi.probeConversation(session.agent, session.id)
      if (!probe.ok) {
        setRelaunchNotice(strings.sessionHistory.relaunchMissingFile)
        return null
      }
      const installation = option.installations[0]
      if (!installation) return strings.sessionHistory.resumeBlockedUnverified

      // 目录算不出来（不存在、或压根没记）时退到「让你选一个」，不报错收场。
      const askForWorkspace = (): null => {
        setNewSessionIntent({
          kind: 'cli',
          option,
          args: formatArgs(plan.args),
          skipApproval: true,
          // ⚠️ 这里必须填**旧目录原值**，不能留空。`NewSessionFlow.openCli` 的
          // 兜底是 `initialWorkspace || lastWorkspace()`：留空会拿到「上次用过
          // 的目录」，那是个存在且合法的目录，用户直接点启动就在一个不相干的
          // 目录里把旧会话续上了 —— 又一次静默落错地方。摆出旧路径既是信息
          // （原来是跑在哪儿的），也逼用户主动改。
          workspace: session.cwd,
          notice: strings.sessionHistory.resumeNoCwd
        })
        setNewSessionOpen(true)
        return null
      }
      // ⚠️ 空 cwd 不能交给 resolveWorkspace：它把空工作区**解析成 Home**
      // （新建会话时那是有意为之），于是恢复会在 Home 里静默起一个会话 ——
      // 用户看不出任何异常，agent 却在错误的目录里开工了。
      if (!session.cwd.trim()) return askForWorkspace()

      let workspace: string
      try {
        workspace = await window.cliApi.resolveWorkspace(installation.id, session.cwd)
      } catch {
        return askForWorkspace()
      }

      return launchCli({
        option,
        installationId: installation.id,
        // 标题拿来当终端名，认得出是哪一场；太长会挤掉旁边的东西。
        name: session.title.trim().slice(0, 60) || option.definition.displayName,
        workspace,
        args: formatArgs(plan.args),
        skipApproval: true
      })
    },
    [launchCli, strings]
  )

  const relaunchLedgerRow = useCallback(
    async (row: SessionLedgerRow): Promise<boolean> => {
      if (!row.agentSessionKey) return false
      if (liveSessionIds.includes(row.id)) return true
      const probe = await window.agentApi.probeConversation(
        row.agentId,
        row.agentSessionKey
      )
      if (!probe.ok) {
        await window.agentApi.dismissResume(row.id)
        setRelaunchRows((current) => current.filter((item) => item.id !== row.id))
        setRelaunchNotice(strings.sessionHistory.relaunchMissingFile)
        return false
      }
      const option =
        cliReport?.launchable.find(
          (candidate) =>
            candidate.definition.adapterId === row.agentId ||
            candidate.definition.id === row.agentId
        ) ?? null
      const installation =
        option?.installations.find((item) => item.id === row.installationId) ??
        option?.installations[0]
      if (!option || !installation) return false
      setRelaunchRows((current) => current.filter((item) => item.id !== row.id))
      await launchCli({
        option,
        installationId: installation.id,
        name: row.name,
        workspace: row.cwd,
        args: formatArgs(row.args),
        skipApproval: true
      })
      return true
    },
    [cliReport, launchCli, liveSessionIds]
  )

  const autoResumeStarted = useRef(false)
  useEffect(() => {
    if (!cliReport || relaunchRows.length === 0 || autoResumeStarted.current) return
    autoResumeStarted.current = true
    const rows = relaunchRows.slice(0, 8)
    void (async () => {
      const blocked = new Set<string>()
      for (const row of rows) {
        const started = await relaunchLedgerRow(row)
        if (!started) blocked.add(row.id)
      }
      if (blocked.size > 0) {
        setRelaunchRows((current) => current.filter((row) => blocked.has(row.id)))
        autoResumeStarted.current = false
      }
    })()
  }, [cliReport, relaunchLedgerRow, relaunchRows])

  /**
   * 从侧栏把一场会话「分叉」继续：同一份历史，全新的 session id，原会话不动。
   *
   * 和 resumeSession 一样复用 launchCli 的整条链路 —— 分叉也不过是一个
   * 「参数里写着 `--resume <id> --fork-session`、目录沿用原会话」的新会话。
   * 入口是侧栏右键菜单，只有 claude / grok 且已经观察到会话 id 的场次才
   * 露出这项（Sidebar.canFork），所以这里的 blocker 沿用 cloneSession /
   * createChildTerminal 同款的静默返回：按钮不该出现的地方点了也点不到。
   *
   * cwd 取该会话终端的目录。空 cwd 不交给 resolveWorkspace（它会把空工作区
   * 解析成 Home，理由见 resumeSession 的注释）；目录失效时退到「让你选一个」，
   * 参数预填好、旧路径摆在输入框里让人过一眼。
   */
  const forkSession = useCallback(
    (session: SessionEntry): void => {
      if (session.kind === 'dsh') return
      const adapterSessionId = session.adapterSessionId?.trim()
      if (!adapterSessionId) return
      const agent = FORK_ADAPTER_AGENTS[session.adapterId]
      if (!agent) return
      const plan = planFork({ agent, id: adapterSessionId, subagent: false })
      if (!plan.ok) return
      const option =
        cliReport?.launchable.find(
          (candidate) => candidate.definition.id === plan.cliId
        ) ?? null
      if (!option || option.installations.length === 0) return
      const installation = option.installations[0]

      // ⚠️ 终端没了/目录拿不到时宁可不动作，也不静默落错地方（同上）。
      const cwd = useTerminalsStore
        .getState()
        .terminals.find((terminal) => terminal.id === session.terminalId)?.cwd
      if (!cwd?.trim()) return

      const askForWorkspace = (): void => {
        setNewSessionIntent({
          kind: 'cli',
          option,
          args: formatArgs(plan.args),
          skipApproval: false,
          // 摆出旧路径既是信息（原来是跑在哪儿的），也逼用户主动改。
          workspace: cwd,
          notice: strings.sessionHistory.resumeNoCwd
        })
        setNewSessionOpen(true)
      }

      void window.cliApi
        .resolveWorkspace(installation.id, cwd)
        .then((workspace) =>
          launchCli({
            option,
            installationId: installation.id,
            name:
              session.name.trim().slice(0, 60) || option.definition.displayName,
            workspace,
            args: formatArgs(plan.args),
            skipApproval: false
          })
        )
        .catch(() => askForWorkspace())
    },
    [cliReport, launchCli, strings]
  )

  /**
   * 从侧栏把一场会话「连代码」分叉：先让主进程建 git worktree（新分支 +
   * 新目录），再把 worktree 目录当工作区起分叉会话。原会话还在原目录里跑，
   * 两边代码互不干扰；未提交的改动留在原目录（worktree 从 HEAD 创建），
   * 所以成功/失败的说明都摆进新建面板的 notice，让人过一眼再启动。
   *
   * 准入与 forkSession 相同（菜单项只在 claude / grok 且已观察到会话 id 时
   * 露出），所以 blocker 同样走静默返回；workspace 不是 git 仓库不预判，
   * 点击后由主进程检查，失败把 stderr 摘要写进失败 notice，不启动。
   * 终端丢失/空 cwd 静默返回，理由见 forkSession。
   */
  const forkSessionWithWorktree = useCallback(
    (session: SessionEntry): void => {
      if (session.kind === 'dsh') return
      const adapterSessionId = session.adapterSessionId?.trim()
      if (!adapterSessionId) return
      const agent = FORK_ADAPTER_AGENTS[session.adapterId]
      if (!agent) return
      const plan = planFork({ agent, id: adapterSessionId, subagent: false })
      if (!plan.ok) return
      const option =
        cliReport?.launchable.find(
          (candidate) => candidate.definition.id === plan.cliId
        ) ?? null
      if (!option || option.installations.length === 0) return
      const cwd = useTerminalsStore
        .getState()
        .terminals.find((terminal) => terminal.id === session.terminalId)?.cwd
      if (!cwd?.trim()) return

      // 失败统一走这里：面板仍按原目录预填，notice 亮出原因 —— 用户想退而
      // 求其次（普通分叉）就确认，不想就取消。
      const showFailure = (reason: string): void => {
        setNewSessionIntent({
          kind: 'cli',
          option,
          args: formatArgs(plan.args),
          skipApproval: false,
          workspace: cwd,
          notice: strings.navigation.forkWorktreeFailed(reason)
        })
        setNewSessionOpen(true)
      }

      void window.cliApi
        .forkWorktree(cwd)
        .then((result) => {
          if (result.ok) {
            // worktree 已建好：参数预填、目录指到分叉目录，notice 把
            // 路径/分支/「未提交改动不带过去」一次说完，确认后才启动。
            setNewSessionIntent({
              kind: 'cli',
              option,
              args: formatArgs(plan.args),
              skipApproval: false,
              workspace: result.dir,
              notice: strings.navigation.forkWorktreeReady(result.dir, result.branch)
            })
            setNewSessionOpen(true)
          } else {
            showFailure(result.reason)
          }
        })
        .catch((error: unknown) => {
          // IPC 层对非法入参会 reject（上面的前置守卫让这条路几乎到不了，
          // 但 reject 无人接就是未处理 rejection）。沿用一期 forkSession 的
          // .catch() 惯例降级成失败 notice，不静默吞。
          showFailure(error instanceof Error ? error.message : String(error))
        })
    },
    [cliReport, strings]
  )

  // 主进程同时持有 PTY 与 Agent projection。renderer reload 时先订阅
  // 增量，再恢复稳定 terminalId 和展示投影。没有可恢复 PTY 时保持
  // 真正的零实例空态；只有用户明确点击入口才创建进程。
  useEffect(() => {
    let cancelled = false
    const unsubscribeProjection = window.agentApi.onProjection((projection) => {
      const sessionsStore = useSessionsStore.getState()
      const previous = sessionsStore.sessions.find(
        (session) => session.sessionId === projection.sessionId
      )
      // DSH 没有 AgentEvent 事件流，只能靠投影状态跃迁触发提示音；
      // 其余 adapter 在 onEvents 里按事件触发，避免同一事件响两次。
      if (
        projection.adapterId === 'dsh' &&
        previous &&
        projection.lastSeq > (previous.projectionSeq ?? -1) &&
        previous.status !== projection.status
      ) {
        if (projection.status === 'needs-you') {
          playNotificationSound('blocked')
        } else if (projection.status === 'done') {
          playNotificationSound('completed')
        } else if (projection.status === 'error') {
          playNotificationSound('error')
        }
      }
      sessionsStore.applyProjection(projection)

      const navigation = useSessionNavigationStore.getState()
      if (!navigation.recoveryComplete) return
      const currentSessions = useSessionsStore.getState().sessions
      navigation.reconcile(
        currentSessions.map((session) => session.terminalId),
        true
      )
      if (projection.status === 'exited') return
      if (
        !previous ||
        projection.lastSeq > (previous.projectionSeq ?? -1) ||
        projection.lastActivityAt > previous.lastActivityAt
      ) {
        useSessionNavigationStore.getState().dispatch(
          { kind: 'activity', terminalId: projection.terminalId },
          useSettingsStore.getState().attentionPriorityEnabled
        )
      }
    })
    const unsubscribeEvents = window.agentApi.onEvents((events) => {
      useAgentEventsStore.getState().record(events)
      for (const event of events) {
        if (event.kind === 'approval.requested' || event.kind === 'input.requested') {
          playNotificationSound('blocked')
        } else if (event.kind === 'turn.completed') {
          playNotificationSound('completed')
        } else if (event.kind === 'turn.failed') {
          playNotificationSound('error')
        }
      }
    })
    void Promise.all([
      window.ptyApi.listRecoverable(),
      window.agentApi.listActive()
    ])
      .then(([recoverable, projections]) => {
        if (cancelled) return
        restoreTerminals(recoverable)
        for (const projection of projections) {
          useSessionsStore.getState().applyProjection(projection)
        }
        useSessionNavigationStore.getState().reconcile(
          useSessionsStore
            .getState()
            .sessions.map((session) => session.terminalId),
          true
        )
      })
      .catch(() => {
        // 恢复失败也不能擅自创建进程；用户仍可从 Home / New Session 启动。
        useSessionNavigationStore.getState().reconcile(
          useSessionsStore
            .getState()
            .sessions.map((session) => session.terminalId),
          true
        )
      })
    return () => {
      cancelled = true
      unsubscribeProjection()
      unsubscribeEvents()
    }
  }, [restoreTerminals])

  useEffect(() => {
    if (!sessionNavigationRecoveryComplete) return
    useSessionNavigationStore
      .getState()
      .reconcile(
        sessions.map((session) => session.terminalId),
        true
      )
  }, [sessionNavigationRecoveryComplete, sessions])

  const handleInitialTerminalSpawn = useCallback(
    (terminalId: string, error: string | null): void => {
      const bridge = pendingBridgeLaunches.current.get(terminalId)
      if (bridge) {
        pendingBridgeLaunches.current.delete(terminalId)
        void window.appApi.reportBridgeLaunch({
          requestId: bridge.requestId,
          error
        })
        if (error) {
          closeTerminal(terminalId)
          setPageId(bridge.previousPage)
        }
        return
      }
      const pending = pendingCliLaunches.current.get(terminalId)
      if (!pending) return
      pendingCliLaunches.current.delete(terminalId)

      if (error) {
        pendingProjectAssign.current.delete(terminalId)
        closeTerminal(terminalId)
        const previousTerminalId = terminalIdFromPage(pending.previousPage)
        const previousPageStillExists =
          !previousTerminalId ||
          useTerminalsStore
            .getState()
            .terminals.some((terminal) => terminal.id === previousTerminalId)
        setPageId(previousPageStillExists ? pending.previousPage : 'home')
        pending.resolve(error)
        return
      }

      // 成功路径：会话条目由主进程 session.started 投影创建，无需本地 addSession。
      setNewSessionOpen(false)
      setPageId(terminalPage(terminalId))
      const note = pending.draft.openingNote?.trim()
      if (note) {
        window.setTimeout(() => {
          const launch = getTerminalLaunch(terminalId)
          if (launch?.kind === 'attach') {
            void window.ptyApi.write(launch.ptyId, `${note}\r`)
          }
        }, 1200)
      }
      pending.resolve(null)
    },
    [closeTerminal]
  )

  const configureCli = useCallback((option: CliOption): void => {
    setNewSessionIntent({ kind: 'cli', option })
    setNewSessionOpen(true)
  }, [])

  const closeTerminalAndRoute = useCallback(
    (terminalId: string): void => {
      const wasActive = terminalIdFromPage(pageId) === terminalId
      const linkedSessionIds = useSessionsStore
        .getState()
        .sessions.filter((session) => session.terminalId === terminalId)
        .map((session) => session.sessionId)
      if (linkedSessionIds.length > 0) {
        void Promise.all(
          linkedSessionIds.map((sessionId) => window.agentApi.stop(sessionId))
        ).finally(() => window.ptyApi.killTerminal(terminalId))
      } else {
        void window.ptyApi.killTerminal(terminalId)
      }

      closeTerminal(terminalId)
      useSessionsStore.getState().removeSessions(linkedSessionIds)

      if (!wasActive) return
      const nextTerminalId = useTerminalsStore.getState().activeTerminalId
      setPageId(nextTerminalId ? terminalPage(nextTerminalId) : 'home')
    },
    [closeTerminal, pageId]
  )

  const closeSessionAndTerminal = useCallback(
    (session: SessionEntry): void => {
      if (session.kind === 'dsh') {
        const wasActive = dshSlotIdFromPage(pageId) === session.sessionId
        void unfollowVisibleDshSlot(session.sessionId)
        if (wasActive) navigate('home')
        return
      }
      const children = useTerminalsStore
        .getState()
        .terminals.filter(
          (terminal) => terminal.parentSessionId === session.sessionId
        )
      const wasActive =
        activeTerminalId === session.terminalId ||
        children.some((terminal) => terminal.id === activeTerminalId)
      for (const child of children) {
        void window.ptyApi.killTerminal(child.id)
        closeTerminal(child.id)
      }

      if (terminalIds.has(session.terminalId)) {
        void window.agentApi
          .stop(session.sessionId)
          .finally(() => window.ptyApi.killTerminal(session.terminalId))
        closeTerminal(session.terminalId)
        removeSession(session.sessionId)
        if (wasActive) {
          const nextTerminalId = useTerminalsStore.getState().activeTerminalId
          setPageId(nextTerminalId ? terminalPage(nextTerminalId) : 'home')
        }
        return
      }

      // 极端竞态：Session projection 已到达，PTY 描述符尚未恢复。
      // 没有 TerminalEntry 时仍必须显式 stop，不能只删 UI。
      void window.agentApi.stop(session.sessionId)
      removeSession(session.sessionId)
      if (wasActive) {
        setPageId('home')
      }
    },
    [activeTerminalId, closeTerminal, navigate, pageId, removeSession, terminalIds]
  )

  const handleTerminalExit = useCallback(
    (terminalId: string): void => {
      const terminalsState = useTerminalsStore.getState()
      const terminal = terminalsState.terminals.find(
        (item) => item.id === terminalId
      )
      const linkedSessions = useSessionsStore
        .getState()
        .sessions.filter((session) => session.terminalId === terminalId)
      if (!terminal?.agentSelection && linkedSessions.length === 0) return

      pendingCliLaunches.current.delete(terminalId)
      const children = terminalsState.terminals.filter((item) =>
        linkedSessions.some(
          (session) => item.parentSessionId === session.sessionId
        )
      )
      for (const child of children) {
        void window.ptyApi.killTerminal(child.id)
        closeTerminal(child.id)
      }

      // 退出与关闭是两个事实：保留 tab、PTY 历史和 exited 投影供本机/手机回看。
      // 用户显式关闭 tab 时 closeTerminalAndRoute 才调用 agent:stop，主进程随后
      // 发布 removed，远程列表也在同一时刻移除。
      markTerminalExited(terminalId)
    },
    [closeTerminal, markTerminalExited]
  )

  const requestCloseSession = useCallback((session: SessionEntry): void => {
    setPendingCloseSession(session)
  }, [])

  const refreshProjects = useCallback((): void => {
    void window.sessionsApi.listProjects().then(setProjects).catch(() => {})
  }, [])

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  const openProject = useCallback((projectId: string): void => {
    void window.sessionsApi.readProject(projectId).then((file) => {
      if (!file) return
      setOpenedProject({ id: projectId, file })
      setPageId('home')
    })
  }, [])

  const hostPickRuntime = useCallback(
    () => ({
      kind: 'host' as const,
      platform: navigator.platform.toLowerCase().includes('mac')
        ? ('macos' as const)
        : navigator.platform.toLowerCase().includes('linux')
          ? ('linux' as const)
          : ('windows' as const)
    }),
    []
  )

  const startBlankProject = useCallback((): void => {
    setPendingProject({ cwd: '', defaultName: '' })
  }, [])

  const pickProjectDirectory = useCallback(async (): Promise<string | null> => {
    const cwd = await window.dialogApi.pickDirectory({ runtime: hostPickRuntime() })
    return cwd || null
  }, [hostPickRuntime])

  const confirmNewProject = useCallback(
    (name: string, cwd: string): void => {
      if (!name.trim() || !cwd.trim()) return
      setPendingProject(null)
      void window.sessionsApi.createProject(name.trim(), cwd.trim()).then((project) => {
        if (!project) {
          setRelaunchNotice(strings.navigation.projectCreateFailed)
          return
        }
        refreshProjects()
        openProject(project.id)
      })
    },
    [openProject, refreshProjects, strings.navigation.projectCreateFailed]
  )

  const createProjectFor = useCallback(
    (session: SessionEntry): void => {
      const cwd =
        useTerminalsStore
          .getState()
          .terminals.find((terminal) => terminal.id === session.terminalId)?.cwd ?? ''
      const name = session.name.trim().slice(0, 40) || '未命名项目'
      void window.sessionsApi.createProject(name, cwd).then(async (project) => {
        if (!project) return
        if (session.adapterSessionId) {
          await window.sessionsApi.assignProject(
            project.id,
            session.adapterId,
            session.adapterSessionId
          )
        }
        refreshProjects()
      })
    },
    [refreshProjects]
  )

  const assignProject = useCallback(
    (session: SessionEntry, projectId: string): void => {
      if (!session.adapterSessionId) return
      void window.sessionsApi
        .assignProject(projectId, session.adapterId, session.adapterSessionId)
        .then(() => refreshProjects())
    },
    [refreshProjects]
  )

  const saveOpenProject = useCallback(
    (projectId: string, file: ProjectFilePayload): void => {
      void window.sessionsApi.saveProject(projectId, file).then((saved) => {
        if (saved) {
          setOpenedProject((current) =>
            current?.id === projectId ? { id: projectId, file: saved } : current
          )
        }
        refreshProjects()
      })
    },
    [refreshProjects]
  )

  const unassignProject = useCallback(
    (session: SessionEntry): void => {
      if (!session.adapterSessionId) return
      void window.sessionsApi
        .unassignProject(session.adapterId, session.adapterSessionId)
        .then(() => refreshProjects())
    },
    [refreshProjects]
  )

  const deleteProject = useCallback(
    (projectId: string): void => {
      void window.sessionsApi.deleteProject(projectId).then((ok) => {
        if (!ok) return
        setOpenedProject((current) => (current?.id === projectId ? null : current))
        refreshProjects()
      })
    },
    [refreshProjects]
  )

  const beginHandoff = useCallback(
    (session: SessionEntry): void => {
      const project = projects.find((item) => projectOwnsSession(item, session))
      if (!project || !session.adapterSessionId) return
      const target =
        cliReport?.launchable.find((item) => item.definition.id !== 'dsh') ?? null
      setHandoffDraft({
        session,
        projectId: project.id,
        agentId: target?.definition.id ?? 'antigravity',
        returning: false,
        brief: [
          `项目：${project.name}`,
          `来自：${session.name}`,
          project.goal ? `目标：${project.goal}` : '',
          '要做的事：'
        ]
          .filter(Boolean)
          .join('\n')
      })
    },
    [cliReport, projects]
  )

  const beginHandBack = useCallback(
    (session: SessionEntry): void => {
      const project = projects.find((item) => projectOwnsSession(item, session))
      if (!project) return
      setHandoffDraft({
        session,
        projectId: project.id,
        agentId: session.adapterId,
        returning: true,
        brief: `交回 ${session.name} 审查：\n`
      })
    },
    [projects]
  )

  const sendHandoff = useCallback((): void => {
    const draft = handoffDraft
    if (!draft) return
    const option =
      cliReport?.launchable.find(
        (item) =>
          item.definition.id === draft.agentId ||
          item.definition.adapterId === draft.agentId
      ) ?? null
    const installation = option?.installations[0]
    const cwd =
      useTerminalsStore
        .getState()
        .terminals.find((terminal) => terminal.id === draft.session.terminalId)?.cwd
    if (!option || !installation || !cwd?.trim()) {
      setHandoffDraft(null)
      return
    }
    const stamp = new Date().toLocaleString()
    void window.sessionsApi.noteProject(
      draft.projectId,
      `${stamp} ${draft.returning ? '交回' : '交给'} ${option.definition.displayName}：${draft.brief.replace(/\s+/g, ' ').slice(0, 180)}`
    )
    if (draft.returning && draft.session.adapterSessionId) {
      const plan = planResume({
        agent: draft.session.adapterId as HistorySession['agent'],
        id: draft.session.adapterSessionId,
        title: draft.session.name,
        cwd,
        createdAt: null,
        updatedAt: null,
        messageCount: 0,
        model: '',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 },
        costUsd: 0,
        costSource: 'none',
        storage: 'file',
        path: '',
        archived: false,
        subagent: false
      })
      const resumeArgs = plan.ok ? formatArgs(plan.args) : ''
      setHandoffDraft(null)
      void launchCli({
        option,
        installationId: installation.id,
        name: draft.session.name,
        workspace: cwd,
        args: resumeArgs,
        skipApproval: true,
        openingNote: draft.brief
      })
      return
    }
    setHandoffDraft(null)
    void launchCli({
      option,
      installationId: installation.id,
      name: `${draft.session.name} · 交接`,
      workspace: cwd,
      args: '',
      skipApproval: false,
      openingNote: draft.brief
    }).then((error) => {
      if (error) return
      const terminalId = useTerminalsStore.getState().activeTerminalId
      if (terminalId) {
        pendingProjectAssign.current.set(terminalId, draft.projectId)
      }
    })
  }, [cliReport, handoffDraft, launchCli])

  useEffect(() => {
    const waiting = pendingProjectAssign.current
    if (waiting.size === 0) return
    for (const [terminalId, projectId] of waiting) {
      const started = sessions.find(
        (session) => session.terminalId === terminalId && session.adapterSessionId
      )
      if (!started?.adapterSessionId) continue
      waiting.delete(terminalId)
      void window.sessionsApi
        .assignProject(projectId, started.adapterId, started.adapterSessionId)
        .then(() => refreshProjects())
    }
  }, [refreshProjects, sessions])

  useEffect(() => {
    const unregister = registerShellShortcutActions({
      openNewSession,
      closeActiveTerminal: () => {
        const terminalId = terminalIdFromPage(pageId)
        if (!terminalId || !terminalIds.has(terminalId)) return false
        closeTerminalAndRoute(terminalId)
        return true
      },
      activateRelativeTerminal: (delta) => {
        const state = useTerminalsStore.getState()
        if (state.terminals.length < 2) return false
        const currentId = terminalIdFromPage(pageId)
        const currentIndex = state.terminals.findIndex(
          (terminal) => terminal.id === currentId
        )
        if (currentIndex < 0) return false
        const nextIndex =
          (currentIndex + delta + state.terminals.length) %
          state.terminals.length
        navigate(terminalPage(state.terminals[nextIndex].id))
        return true
      }
    })

    const handleWindowKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('.xterm')) return
      handleShellShortcut(event)
    }
    window.addEventListener('keydown', handleWindowKeyDown)
    return () => {
      unregister()
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [closeTerminalAndRoute, navigate, openNewSession, pageId, terminalIds])

  useEffect(() => {
    if (!import.meta.env.DEV && !window.__ASC_E2E__) return
    const api: ASCDebugShellApi = {
      navigate: (nextPage) => {
        if (isPageId(nextPage)) navigate(nextPage)
      },
      openNewSession,
      setNavMode,
      agentEvents: () => [...useAgentEventsStore.getState().events],
      agentSessions: () => [...useSessionsStore.getState().sessions]
    }
    window.__ascDebugShell = api
    return () => {
      if (window.__ascDebugShell === api) {
        delete window.__ascDebugShell
      }
    }
  }, [navigate, openNewSession, setNavMode])

  // 侧栏 ↔ 图标栏共用一个容器：容器只动宽度，内容层交叉淡入淡出。
  // 不能给两种形态各建一个带退出动画的元素——退出层会叠在进入层上产生重影。
  const sideNavigation =
    (
      <motion.div
        key="sidenav"
        className="relative shrink-0 overflow-hidden"
        initial={{ width: 0 }}
        animate={{ width: navMode === 'sidebar' ? 280 : 48 }}
        exit={{ width: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      >
        <AnimatePresence initial={false} mode="wait">
          {navMode === 'sidebar' ? (
            <motion.div
              key="sidebar"
              className="absolute inset-y-0 left-0 flex"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <Sidebar
                pageId={pageId}
                sessions={navigationSessions}
                terminals={standaloneTerminals}
                childTerminals={childTerminals}
                drivenSessionId={remoteDrive.sessionId}
                onNavigate={navigate}
                onOpenNewSession={openNewSession}
                onCollapse={() => setNavMode('rail')}
                onRenameSession={renameSession}
                onCloneSession={cloneSession}
                onForkSession={forkSession}
                onForkSessionGit={forkSessionWithWorktree}
                onCreateChildTerminal={(session) => {
                  void createChildTerminal(session)
                }}
                onCloseSession={requestCloseSession}
                onCloseTerminal={closeTerminalAndRoute}
                projects={projects}
                onOpenProject={openProject}
                onCreateProject={createProjectFor}
                onNewProject={startBlankProject}
                onAssignProject={assignProject}
                onUnassignProject={unassignProject}
                onHandoff={beginHandoff}
                onHandBack={beginHandBack}
              />
            </motion.div>
          ) : (
            <motion.div
              key="rail"
              className="absolute inset-y-0 left-0 flex"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <IconRail
                pageId={pageId}
                sessions={navigationSessions}
                terminals={nonSessionTerminals}
                drivenSessionId={remoteDrive.sessionId}
                onNavigate={navigate}
                onOpenNewSession={openNewSession}
                onExpand={() => setNavMode('sidebar')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )

  return (
    <div className="app-shell isolate relative flex h-full w-full select-none flex-col overflow-hidden">
      {openQuestions.length > 0 ? (
        <div className="relative z-20 mx-3 mt-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm">
          <div className="font-medium">{strings.sessionHistory.openQuestionsTitle}</div>
          <div className="mt-1 text-[var(--muted)]">
            {strings.sessionHistory.openQuestionsBody(openQuestions.length)}
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {openQuestions.slice(0, 3).map((question) => {
              const live = liveSessionIds.includes(question.sessionId)
              const draft = questionDrafts[question.id] ?? ''
              return (
                <form
                  key={question.id}
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const submitter = (event.nativeEvent as SubmitEvent).submitter
                    const picked = submitter?.getAttribute('data-choice')?.trim() ?? ''
                    const answer = picked || (question.choices.length === 0 ? draft.trim() : '')
                    if (!answer) return
                    void window.agentApi.answerTaskQuestion(question.id, answer).then((result) => {
                      if (!result) {
                        setRelaunchNotice(strings.sessionHistory.answerNotDelivered)
                        return
                      }
                      setOpenQuestions((current) =>
                        current.filter((item) => item.id !== question.id)
                      )
                      setRelaunchNotice(
                        result.alreadyAnswered
                          ? strings.sessionHistory.answerKept
                          : result.delivered
                            ? strings.sessionHistory.answerDelivered
                            : strings.sessionHistory.answerNotDelivered
                      )
                    })
                  }}
                >
                  <div>{question.prompt}</div>
                  {live ? (
                    <div className="flex gap-2">
                      {question.choices.length > 0 ? (
                        question.choices.map((choice) => (
                          <button
                            key={choice}
                            type="submit"
                            data-choice={choice}
                            className="rounded-lg border border-[var(--line)] px-2 py-1"
                          >
                            {choice}
                          </button>
                        ))
                      ) : (
                        <>
                          <input
                            className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1"
                            value={draft}
                            onChange={(event) =>
                              setQuestionDrafts((current) => ({
                                ...current,
                                [question.id]: event.target.value
                              }))
                            }
                          />
                          <button
                            type="submit"
                            className="rounded-lg bg-[var(--accent)] px-3 py-1 text-white"
                          >
                            {strings.sessionHistory.answerQuestion}
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="text-[var(--muted)]">
                      {strings.sessionHistory.answerNeedsRelaunch}
                    </div>
                  )}
                </form>
              )
            })}
          </div>
        </div>
      ) : null}
      {relaunchNotice ? (
        <div className="relative z-20 mx-3 mt-2 rounded-xl border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]">
          {relaunchNotice}
        </div>
      ) : null}
      {relaunchRows.length > 0 ? (
        <div className="relative z-20 mx-3 mt-2 flex items-start justify-between gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm">
          <div>
            <div className="font-medium">{strings.sessionHistory.relaunchTitle}</div>
            <div className="mt-1 text-[var(--muted)]">
              {strings.sessionHistory.relaunchBody(relaunchRows.length)}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {relaunchRows.slice(0, 3).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="rounded-lg border border-[var(--line)] px-2 py-1"
                  onClick={() => void relaunchLedgerRow(row)}
                >
                  {strings.sessionHistory.relaunchOne} · {row.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="rounded-lg bg-[var(--accent)] px-3 py-1 text-white"
              onClick={() => {
                for (const row of relaunchRows) void relaunchLedgerRow(row)
              }}
            >
              {strings.sessionHistory.relaunchAll}
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1 text-[var(--muted)]"
              onClick={() => setRelaunchRows([])}
            >
              {strings.sessionHistory.relaunchDismiss}
            </button>
          </div>
        </div>
      ) : null}
      {/* 环境渐变垫在全部镶边（标题栏/侧栏/圆角缺口）下面；内容面板不透明底色自然盖住自己的区域 */}
      <SidebarTint />
      <TitleBar
        onNew={openNewSession}
        onSettings={() => {
          setSettingsCategory('appearance')
          navigate('settings')
        }}
        settingsActive={pageId === 'settings'}
        onSessions={() => navigate('sessions')}
        sessionsActive={pageId === 'sessions'}
        onStats={() => navigate('stats')}
        statsActive={pageId === 'stats'}
        onFeishu={() => {
          setSettingsCategory('feishu')
          navigate('settings')
        }}
        feishuActive={pageId === 'settings' && settingsCategory === 'feishu'}
        feishuPhase={feishuStatus.phase}
        updateBadge={updateBadge}
        onOpenUpdate={() => {
          setSettingsCategory('update')
          navigate('settings')
        }}
        onToggleCode={
          activeHasWorkspace && activeTerminalId
            ? () => setReaderOpen(activeTerminalId, !activeReaderOpen)
            : undefined
        }
        codeOpen={activeReaderOpen}
        onRestartDsh={
          isDshPage(pageId) ? () => void restartDshHost() : undefined
        }
        dshRestarting={dshRestarting}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* 默认 sync 模式：退出的侧栏容器留在文档流里收缩到 0，主内容跟随过渡 */}
        <AnimatePresence initial={false}>{sideNavigation}</AnimatePresence>

        <main
          data-testid="app-content"
          className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-content ${
            // DSH 原生视图四角圆角，内容区同步四角圆角以露出与侧栏一致的环境色；
            // 其余页面维持左上角圆角，圆角开关关闭时终端页贴边直角。
            activeDshSlotId && terminalRounded
              ? 'rounded-[20px]'
              : terminalRounded || (!activeTerminalId && !activeDshSlotId)
                ? 'rounded-tl-[20px]'
                : ''
          }`}
        >
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {pageId === 'home' && openedProject && (
              <section data-testid="project-editor" className="flex h-full flex-col gap-3 overflow-y-auto p-6">
                <h1 className="font-pingfang text-[18px] font-semibold text-text-primary">
                  {projects.find((project) => project.id === openedProject.id)?.name ?? '项目'}
                </h1>
                <label className="font-pingfang text-[12px] text-text-muted">
                  目标
                  <textarea
                    value={openedProject.file.goal}
                    onChange={(event) =>
                      setOpenedProject({
                        id: openedProject.id,
                        file: { ...openedProject.file, goal: event.target.value }
                      })
                    }
                    className="mt-1 h-24 w-full rounded-lg border border-border-default bg-content p-2 text-[12px] text-text-primary"
                  />
                </label>
                <label className="font-pingfang text-[12px] text-text-muted">
                  进展
                  <textarea
                    value={openedProject.file.progress}
                    onChange={(event) =>
                      setOpenedProject({
                        id: openedProject.id,
                        file: { ...openedProject.file, progress: event.target.value }
                      })
                    }
                    className="mt-1 h-40 w-full rounded-lg border border-border-default bg-content p-2 text-[12px] text-text-primary"
                  />
                </label>
                {openedProject.file.agents ? (
                  <section className="rounded-lg border border-border-default p-3">
                    <h2 className="font-pingfang text-[12px] text-text-muted">
                      {strings.navigation.projectAgents}
                    </h2>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-pingfang text-[12px] leading-5 text-text-secondary">
                      {openedProject.file.agents}
                    </pre>
                  </section>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveOpenProject(openedProject.id, openedProject.file)}
                    className="w-fit rounded-lg bg-button-primary px-3 py-1.5 font-pingfang text-[12px] text-button-primary-fg"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    data-testid="project-new-session"
                    onClick={() => {
                      const project = projects.find((item) => item.id === openedProject.id)
                      if (!project) return
                      setNewSessionIntent({ kind: 'sheet', workspace: project.cwd })
                      setNewSessionOpen(true)
                    }}
                    className="w-fit rounded-lg border border-border-default px-3 py-1.5 font-pingfang text-[12px] text-text-secondary"
                  >
                    {strings.navigation.newSessionInProject}
                  </button>
                  <button
                    type="button"
                    data-testid="project-delete"
                    onClick={() => {
                      const name =
                        projects.find((project) => project.id === openedProject.id)?.name ?? ''
                      if (!window.confirm(strings.navigation.deleteProjectConfirm(name))) return
                      deleteProject(openedProject.id)
                    }}
                    className="ml-auto w-fit rounded-lg border border-border-default px-3 py-1.5 font-pingfang text-[12px] text-text-secondary"
                  >
                    {strings.navigation.deleteProject}
                  </button>
                </div>
              </section>
            )}
            {pageId === 'home' && !openedProject && (
              <HomePage
                sessions={sessions}
                shells={shells}
                clis={cliReport?.launchable ?? []}
                cliScanning={cliScanning}
                dshRuntimeReport={dshRuntimeReport}
                dshRuntimeScanning={dshRuntimeScanning}
                defaultTerminal={defaultTerminal}
                onLaunchDefaultTerminal={launchDefaultTerminal}
                onChooseTerminal={() => {
                  setNewSessionIntent({ kind: 'terminal' })
                  setNewSessionOpen(true)
                }}
                onConfigureCli={configureCli}
                onRefreshRuntimes={() => {
                  void Promise.all([scanClis(true), scanDshRuntimes(true)])
                }}
                onViewSession={(session) => navigate(sessionPage(session))}
                onOpenDsh={openDshSlot}
              />
            )}
            <DshPage
              slotId={activeDshSlotId}
              adapterSessionId={activeDshAdapterSessionId}
              active={isDshPage(pageId)}
              obscured={newSessionOpen || pendingCloseSession !== null}
              hostRestarting={dshRestarting}
              restartSnapshot={dshRestartSnapshot}
            />
            {pageId === 'sessions' && (
              <SessionHistoryPage
                clis={cliReport?.launchable ?? []}
                onResumeSession={resumeSession}
                onOpenDshSession={openDshHistorySession}
              />
            )}
            {pageId === 'stats' && <UsagePage />}
            {pageId === 'settings' && (
              <SettingsPage
                initialCategory={settingsCategory}
                shells={shells}
                cliCount={cliReport?.launchable.length ?? 0}
                cliScanning={cliScanning}
                cliScanError={cliScanError}
                cliRuntimeErrors={cliReport?.runtimeErrors ?? []}
                onRefreshClis={() => void scanClis(true)}
                dshRuntimeReport={dshRuntimeReport}
                dshRuntimeScanning={dshRuntimeScanning}
                dshRuntimeScanError={dshRuntimeScanError}
                onRefreshDshRuntimes={() => void scanDshRuntimes(true)}
              />
            )}
            {activeTerminalId && !terminalIds.has(activeTerminalId) && (
              <UnavailableTerminalPage />
            )}
            {terminals.map((terminal) => (
              <TerminalPage
                key={terminal.id}
                terminal={terminal}
                active={activeTerminalId === terminal.id}
                remoteDrive={remoteDrive}
                onInitialSpawn={handleInitialTerminalSpawn}
                onExit={handleTerminalExit}
              />
            ))}
          </div>
        </main>
      </div>

      {!activeTerminalId && targetCursorEnabled && (
        <TargetCursor
          showCursor={false}
          hideDefaultCursor={false}
          spinDuration={2}
          parallaxOn
          hoverDuration={0.2}
          cursorColor="var(--asc-accent-cursor)"
          cursorColorOnTarget="var(--asc-accent-target)"
        />
      )}

      <NewSessionFlow
        open={newSessionOpen}
        shells={shells}
        clis={cliReport?.launchable ?? []}
        defaultTerminal={defaultTerminal}
        initialCli={
          newSessionIntent.kind === 'cli' ? newSessionIntent.option : undefined
        }
        initialTerminalPicker={newSessionIntent.kind === 'terminal'}
        initialArgs={
          newSessionIntent.kind === 'cli' ? newSessionIntent.args : undefined
        }
        initialWorkspace={
          newSessionIntent.kind === 'cli' || newSessionIntent.kind === 'sheet'
            ? newSessionIntent.workspace
            : undefined
        }
        initialNotice={
          newSessionIntent.kind === 'cli' ? newSessionIntent.notice : undefined
        }
        initialSkipApproval={
          newSessionIntent.kind === 'cli'
            ? newSessionIntent.skipApproval
            : undefined
        }
        onClose={() => {
          setNewSessionOpen(false)
          setNewSessionIntent({ kind: 'sheet' })
        }}
        onOpenDsh={openDshFromNewSession}
        onLaunchTerminal={launchTerminal}
        onLaunchCli={launchCli}
        onWorkspaceHistoryChange={(history) =>
          void window.remoteApi.setRecentWorkspaces(history)
        }
      />

      <AnimatePresence>
        {pendingProject && (
          <NewProjectDialog
            key="new-project"
            defaultName={pendingProject.defaultName}
            initialCwd={pendingProject.cwd}
            onCancel={() => setPendingProject(null)}
            onPickDirectory={pickProjectDirectory}
            onConfirm={confirmNewProject}
          />
        )}
        {pendingCloseSession && (
          <CloseSessionDialog
            key={pendingCloseSession.sessionId}
            session={pendingCloseSession}
            onCancel={() => setPendingCloseSession(null)}
            onConfirm={() => {
              const session = pendingCloseSession
              setPendingCloseSession(null)
              closeSessionAndTerminal(session)
            }}
          />
        )}
      </AnimatePresence>

      {handoffDraft && (
        <div
          data-testid="handoff-dialog"
          className="absolute inset-0 z-[95] flex items-center justify-center bg-backdrop-strong p-6"
        >
          <div className="flex w-[420px] flex-col gap-3 rounded-xl border border-border-default bg-surface p-4">
            <h2 className="font-pingfang text-[14px] font-semibold text-text-primary">
              {handoffDraft.returning ? '交回' : '交给其他助手'}
            </h2>
            <select
              value={handoffDraft.agentId}
              onChange={(event) =>
                setHandoffDraft({ ...handoffDraft, agentId: event.target.value })
              }
              className="rounded-md border border-border-default bg-content px-2 py-1 text-[12px]"
            >
              {(cliReport?.launchable ?? [])
                .filter((item) => item.definition.id !== 'dsh')
                .map((item) => (
                  <option key={item.definition.id} value={item.definition.id}>
                    {item.definition.displayName}
                  </option>
                ))}
            </select>
            <textarea
              value={handoffDraft.brief}
              onChange={(event) =>
                setHandoffDraft({ ...handoffDraft, brief: event.target.value })
              }
              className="h-40 rounded-md border border-border-default bg-content p-2 font-pingfang text-[12px] text-text-primary"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setHandoffDraft(null)}
                className="rounded-lg px-3 py-1.5 font-pingfang text-[12px] text-text-muted"
              >
                取消
              </button>
              <button
                type="button"
                data-testid="handoff-submit"
                onClick={sendHandoff}
                className="rounded-lg bg-button-primary px-3 py-1.5 font-pingfang text-[12px] text-button-primary-fg"
              >
                送出
              </button>
            </div>
          </div>
        </div>
      )}
      <AnimatePresence>
        {updateModalVersion && (
          <UpdateAvailableModal
            key={updateModalVersion}
            version={updateModalVersion}
            releaseNotes={updateModalReleaseNotes}
            ready={updateModalReady}
            onUpdate={applyUpdateModal}
            onIgnore={ignoreUpdateModal}
            onNever={neverUpdateModal}
            onLater={closeUpdateModal}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function UnavailableTerminalPage() {
  const strings = useStrings()
  return (
    <section
      data-testid="unavailable-terminal-page"
      className="flex h-full items-center justify-center px-8 text-center font-pingfang text-[12px] text-text-muted"
    >
      {strings.shell.unavailableTerminal}
    </section>
  )
}
