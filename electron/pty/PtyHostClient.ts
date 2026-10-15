/**
 * Electron 主进程里的终端客户端。
 * 外观和 PTYManager 一样，真正的 node-pty 在独立宿主进程里。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { connect, type Socket } from 'node:net'
import { createInterface } from 'node:readline'
import { sendToEachWindow } from '../safe-send'
import {
  ptyDataChannel,
  ptyExitChannel,
  ptyResizeCursorSyncChannel,
  type ExitPayload,
  type PtyFlowControlSnapshot,
  type PtyHistorySnapshot,
  type RecoverablePty,
  type SpawnOptions
} from '../../shared/ipc-contract'
import {
  HOST_PROTOCOL,
  isHostEvent,
  ptyHostPipeName,
  type HostEventKind,
  type HostRequest,
  type HostResult
} from './PtyHostContract'

interface PendingCall {
  resolve(value: unknown): void
  reject(error: Error): void
}

export class PtyHostClient {
  private child: ChildProcess | null = null
  private socket: Socket | null = null
  private nextId = 1
  private readonly pending = new Map<number, PendingCall>()
  private readonly exitListeners = new Map<string, Set<(payload: ExitPayload) => void>>()
  private readonly inputListeners = new Map<string, Set<() => void>>()
  private readonly displayListeners = new Map<string, Set<(data: Uint8Array) => void>>()
  private readonly cursorListeners = new Map<
    string,
    Set<(payload: { row: number; column: number }) => void>
  >()
  private readonly terminalRemovedListeners = new Set<(terminalId: string) => void>()
  private readonly exitedPayloads = new Map<string, ExitPayload>()
  private ready: Promise<void> | null = null
  private resolveReady: (() => void) | null = null

  constructor(
    private readonly command: string,
    private readonly scriptPath: string,
    private readonly extraEnv: Record<string, string> = {}
  ) {}

  async ensureStarted(): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      await this.ready
      return
    }
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve
    })
    const connected = await this.tryConnect()
    if (!connected) {
      await this.spawnHost()
      const retried = await this.tryConnect()
      if (!retried) throw new Error('pty host did not accept a connection')
    }
    await this.ready
  }

  private tryConnect(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = connect(ptyHostPipeName())
      const fail = (): void => {
        socket.destroy()
        resolve(false)
      }
      socket.once('error', fail)
      socket.once('connect', () => {
        socket.off('error', fail)
        this.bindSocket(socket)
        resolve(true)
      })
    })
  }

  private bindSocket(socket: Socket): void {
    this.socket = socket
    const lines = createInterface({ input: socket })
    lines.on('line', (line) => this.onLine(line))
    socket.on('close', () => {
      if (this.socket === socket) {
        this.socket = null
        this.failPending(new Error('pty host disconnected'))
      }
    })
  }

  private async spawnHost(): Promise<void> {
    if (this.child && this.child.exitCode === null) return
    const child = spawn(this.command, [this.scriptPath], {
      stdio: 'ignore',
      detached: true,
      env: {
        ...process.env,
        ...this.extraEnv,
        ELECTRON_RUN_AS_NODE: '1'
      },
      windowsHide: true
    })
    child.unref()
    this.child = child
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  private onLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) return
    let message: unknown
    try {
      message = JSON.parse(trimmed)
    } catch {
      return
    }
    if (isHostEvent(message)) {
      this.onEvent(message)
      return
    }
    const result = message as HostResult
    if (!result || typeof result.id !== 'number') return
    const pending = this.pending.get(result.id)
    if (!pending) return
    this.pending.delete(result.id)
    if (result.ok) pending.resolve(result.value)
    else pending.reject(new Error(result.error || 'pty host failed'))
  }

  private onEvent(event: ReturnType<typeof Object> & { ev: string }): void {
    if (event.ev === 'ready') {
      this.resolveReady?.()
      this.resolveReady = null
      return
    }
    if (event.ev === 'data' && 'ptyId' in event && 'data' in event) {
      const raw = event as { ptyId: string; data: string }
      sendToEachWindow(ptyDataChannel(raw.ptyId), Buffer.from(raw.data, 'base64'))
      return
    }
    if (event.ev === 'exit' && 'ptyId' in event) {
      const raw = event as { ptyId: string; payload: ExitPayload }
      sendToEachWindow(ptyExitChannel(raw.ptyId), raw.payload)
      this.exitedPayloads.set(raw.ptyId, raw.payload)
      for (const listener of this.exitListeners.get(raw.ptyId) ?? []) listener(raw.payload)
      return
    }
    if (event.ev === 'cursor' && 'ptyId' in event) {
      const raw = event as { ptyId: string; row: number; column: number }
      sendToEachWindow(ptyResizeCursorSyncChannel(raw.ptyId), {
        row: raw.row,
        column: raw.column
      })
      for (const listener of this.cursorListeners.get(raw.ptyId) ?? []) {
        listener({ row: raw.row, column: raw.column })
      }
      return
    }
    if (event.ev === 'display' && 'ptyId' in event) {
      const raw = event as { ptyId: string; data: string }
      const bytes = Buffer.from(raw.data, 'base64')
      for (const listener of this.displayListeners.get(raw.ptyId) ?? []) listener(bytes)
      return
    }
    if (event.ev === 'input' && 'ptyId' in event) {
      const raw = event as { ptyId: string }
      for (const listener of this.inputListeners.get(raw.ptyId) ?? []) listener()
      return
    }
    if (event.ev === 'terminal-removed' && 'terminalId' in event) {
      const raw = event as { terminalId: string }
      for (const listener of this.terminalRemovedListeners) listener(raw.terminalId)
    }
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }

  private call(request: Omit<HostRequest, 'id'> & Record<string, unknown>): Promise<unknown> {
    const socket = this.socket
    if (!socket || socket.destroyed) {
      return Promise.reject(new Error('pty host is not running'))
    }
    const id = this.nextId++
    const payload = { ...request, id }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      socket.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (error) {
          this.pending.delete(id)
          reject(error)
        }
      })
    })
  }

  async spawn(opts: SpawnOptions): Promise<{ ptyId: string }> {
    await this.ensureStarted()
    const value = (await this.call({ op: 'spawn', opts })) as { ptyId: string }
    await this.call({
      op: 'subscribe',
      ptyId: value.ptyId,
      kinds: ['data', 'exit', 'cursor', 'display', 'input'] satisfies HostEventKind[]
    })
    return value
  }

  write(ptyId: string, data: string): void {
    void this.call({ op: 'write', ptyId, data }).catch((error) => {
      console.warn('[pty-host] write failed:', error)
    })
  }

  resize(ptyId: string, cols: number, rows: number): void {
    void this.call({ op: 'resize', ptyId, cols, rows }).catch(() => {})
  }

  ack(ptyId: string, bytes: number): void {
    void this.call({ op: 'ack', ptyId, bytes }).catch(() => {})
  }

  kill(ptyId: string): void {
    void this.call({ op: 'kill', ptyId }).catch(() => {})
  }

  killTerminal(terminalId: string): void {
    void this.call({ op: 'kill-terminal', terminalId }).catch(() => {})
  }

  killAll(): void {
    void this.call({ op: 'kill-all' }).catch(() => {})
  }

  async shutdown(): Promise<void> {
    await this.ensureStarted().catch(() => {})
    try {
      await this.call({ op: 'shutdown' })
    } catch {
      this.child?.kill()
    }
    this.socket?.destroy()
    this.socket = null
  }

  async attach(ptyId: string): Promise<PtyHistorySnapshot | null> {
    await this.ensureStarted()
    return (await this.call({ op: 'attach', ptyId })) as PtyHistorySnapshot | null
  }

  async history(ptyId: string): Promise<PtyHistorySnapshot | null> {
    return (await this.call({ op: 'history', ptyId })) as PtyHistorySnapshot | null
  }

  async displayHistory(ptyId: string): Promise<PtyHistorySnapshot | null> {
    return (await this.call({ op: 'display-history', ptyId })) as PtyHistorySnapshot | null
  }

  async flowControl(ptyId: string): Promise<PtyFlowControlSnapshot | null> {
    return (await this.call({ op: 'flow', ptyId })) as PtyFlowControlSnapshot | null
  }

  async listRecoverable(): Promise<RecoverablePty[]> {
    await this.ensureStarted()
    return ((await this.call({ op: 'list' })) as RecoverablePty[]) ?? []
  }

  async ptyIdForTerminal(terminalId: string): Promise<string | null> {
    await this.ensureStarted()
    return ((await this.call({ op: 'pty-for-terminal', terminalId })) as string | null) ?? null
  }

  async isRunning(ptyId: string): Promise<boolean> {
    await this.ensureStarted()
    return Boolean(await this.call({ op: 'is-running', ptyId }))
  }

  async lastOutputAt(ptyId: string): Promise<number | null> {
    await this.ensureStarted()
    const value = await this.call({ op: 'last-output-at', ptyId })
    return typeof value === 'number' ? value : null
  }

  onExit(ptyId: string, cb: (payload: ExitPayload) => void): () => void {
    const listeners = this.exitListeners.get(ptyId) ?? new Set()
    listeners.add(cb)
    this.exitListeners.set(ptyId, listeners)
    const cached = this.exitedPayloads.get(ptyId)
    if (cached) queueMicrotask(() => cb(cached))
    return () => {
      this.exitListeners.get(ptyId)?.delete(cb)
    }
  }

  onInputSubmitted(ptyId: string, cb: () => void): () => void {
    const listeners = this.inputListeners.get(ptyId) ?? new Set()
    listeners.add(cb)
    this.inputListeners.set(ptyId, listeners)
    return () => {
      this.inputListeners.get(ptyId)?.delete(cb)
    }
  }

  onDisplayOutput(ptyId: string, listener: (data: Uint8Array) => void): () => void {
    const listeners = this.displayListeners.get(ptyId) ?? new Set()
    listeners.add(listener)
    this.displayListeners.set(ptyId, listeners)
    return () => {
      this.displayListeners.get(ptyId)?.delete(listener)
    }
  }

  onCursorSync(
    ptyId: string,
    listener: (payload: { row: number; column: number }) => void
  ): () => void {
    const listeners = this.cursorListeners.get(ptyId) ?? new Set()
    listeners.add(listener)
    this.cursorListeners.set(ptyId, listeners)
    return () => {
      this.cursorListeners.get(ptyId)?.delete(listener)
    }
  }

  onTerminalRemoved(listener: (terminalId: string) => void): () => void {
    this.terminalRemovedListeners.add(listener)
    return () => this.terminalRemovedListeners.delete(listener)
  }

  async acquireRemoteResizeAsync(
    ptyId: string,
    owner: string,
    cols: number,
    rows: number
  ): Promise<boolean> {
    return Boolean(await this.call({ op: 'acquire-remote', ptyId, owner, cols, rows }))
  }

  resizeRemote(ptyId: string, owner: string, cols: number, rows: number): void {
    void this.call({ op: 'resize-remote', ptyId, owner, cols, rows }).catch(() => {})
  }

  releaseRemoteResize(ptyId: string, owner: string): void {
    void this.call({ op: 'release-remote', ptyId, owner }).catch(() => {})
  }

  pauseOutput(ptyId: string, owner: string): void {
    void this.call({ op: 'pause', ptyId, owner }).catch(() => {})
  }

  resumeOutput(ptyId: string, owner: string): void {
    void this.call({ op: 'resume', ptyId, owner }).catch(() => {})
  }
}

export { HOST_PROTOCOL }
