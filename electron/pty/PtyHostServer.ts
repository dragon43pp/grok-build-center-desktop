/**
 * 终端宿主服务端。跑在独立 Node 进程里，唯一持有 node-pty。
 * 一行一条 JSON。窗口断开时不杀终端，除非对端明确要求 shutdown。
 */
import { createInterface, type Interface } from 'node:readline'
import type { Duplex } from 'node:stream'
import { PTYManager } from './PTYManager'
import {
  HOST_PROTOCOL,
  type HostEvent,
  type HostEventKind,
  type HostRequest
} from './PtyHostContract'

interface LiveSub {
  subId: number
  ptyId: string
  stop: Array<() => void>
}

export class PtyHostServer {
  private readonly manager = new PTYManager()
  private readonly subs = new Map<number, LiveSub>()
  private nextSub = 1
  private lineReader: Interface | null = null
  private client: Duplex | null = null

  constructor() {
    this.manager.setDisplayDeliver((ptyId, data) => {
      this.emit({ ev: 'data', ptyId, data: Buffer.from(data).toString('base64') })
    })
    this.manager.onTerminalRemoved((terminalId) => {
      this.emit({ ev: 'terminal-removed', terminalId })
    })
  }

  /** 新窗口连上时换客户端。旧订阅清掉，终端不杀。 */
  attachClient(socket: Duplex): void {
    this.dropClient()
    this.client = socket
    this.lineReader = createInterface({ input: socket })
    this.lineReader.on('line', (line) => {
      void this.handleLine(line)
    })
    socket.on('error', () => this.dropClient())
    socket.on('close', () => {
      if (this.client === socket) this.dropClient()
    })
    this.emit({ ev: 'ready', protocol: HOST_PROTOCOL })
  }

  private dropClient(): void {
    for (const live of this.subs.values()) {
      for (const stop of live.stop) stop()
    }
    this.subs.clear()
    this.lineReader?.close()
    this.lineReader = null
    const current = this.client
    this.client = null
    current?.destroy()
  }

  private emit(event: HostEvent): void {
    const client = this.client
    if (!client || client.writableEnded) return
    client.write(`${JSON.stringify(event)}\n`)
  }

  private reply(id: number, ok: true, value?: unknown): void
  private reply(id: number, ok: false, error: string): void
  private reply(id: number, ok: boolean, value?: unknown): void {
    const client = this.client
    if (!client) return
    const payload = ok
      ? { id, ok: true as const, ...(value === undefined ? {} : { value }) }
      : { id, ok: false as const, error: String(value) }
    client.write(`${JSON.stringify(payload)}\n`)
  }

  private async handleLine(line: string): Promise<void> {
    const trimmed = line.trim()
    if (!trimmed) return
    let request: HostRequest
    try {
      request = JSON.parse(trimmed) as HostRequest
    } catch {
      return
    }
    if (!request || typeof request.id !== 'number') return
    try {
      const value = await this.dispatch(request)
      this.reply(request.id, true, value)
    } catch (error) {
      this.reply(request.id, false, error instanceof Error ? error.message : String(error))
    }
  }

  private async dispatch(request: HostRequest): Promise<unknown> {
    switch (request.op) {
      case 'hello':
        return { protocol: HOST_PROTOCOL }
      case 'spawn':
        return this.manager.spawn(request.opts)
      case 'write':
        this.manager.write(request.ptyId, request.data)
        return null
      case 'resize':
        this.manager.resize(request.ptyId, request.cols, request.rows)
        return null
      case 'ack':
        this.manager.ack(request.ptyId, request.bytes)
        return null
      case 'kill':
        this.manager.kill(request.ptyId)
        return null
      case 'kill-terminal':
        this.manager.killTerminal(request.terminalId)
        return null
      case 'kill-all':
        this.manager.killAll()
        return null
      case 'attach':
        return this.manager.attach(request.ptyId)
      case 'history':
        return this.manager.history(request.ptyId)
      case 'display-history':
        return this.manager.displayHistory(request.ptyId)
      case 'flow':
        return this.manager.flowControl(request.ptyId)
      case 'list':
        return this.manager.listRecoverable()
      case 'pty-for-terminal':
        return this.manager.ptyIdForTerminal(request.terminalId)
      case 'is-running':
        return this.manager.isRunning(request.ptyId)
      case 'last-output-at':
        return this.manager.lastOutputAt(request.ptyId)
      case 'acquire-remote':
        return this.manager.acquireRemoteResize(
          request.ptyId,
          request.owner,
          request.cols,
          request.rows
        )
      case 'resize-remote':
        this.manager.resizeRemote(request.ptyId, request.owner, request.cols, request.rows)
        return null
      case 'release-remote':
        this.manager.releaseRemoteResize(request.ptyId, request.owner as string)
        return null
      case 'pause':
        this.manager.pauseOutput(request.ptyId, request.owner)
        return null
      case 'resume':
        this.manager.resumeOutput(request.ptyId, request.owner)
        return null
      case 'subscribe':
        return this.subscribe(request.ptyId, request.kinds)
      case 'unsubscribe':
        this.unsubscribe(request.subId)
        return null
      case 'shutdown':
        this.manager.killAll()
        setTimeout(() => process.exit(0), 20)
        return null
      default:
        throw new Error('unknown pty host op')
    }
  }

  private subscribe(ptyId: string, kinds: HostEventKind[]): number {
    const subId = this.nextSub++
    const stop: Array<() => void> = []
    const wanted = new Set(kinds)
    if (wanted.has('exit')) {
      stop.push(
        this.manager.onExit(ptyId, (payload) => {
          this.emit({ ev: 'exit', ptyId, payload })
        })
      )
    }
    if (wanted.has('input')) {
      stop.push(
        this.manager.onInputSubmitted(ptyId, () => {
          this.emit({ ev: 'input', ptyId })
        })
      )
    }
    if (wanted.has('output')) {
      stop.push(
        this.manager.onOutput(ptyId, (data) => {
          this.emit({ ev: 'output', ptyId, data: Buffer.from(data).toString('base64') })
        })
      )
    }
    if (wanted.has('display')) {
      stop.push(
        this.manager.onDisplayOutput(ptyId, (data) => {
          this.emit({ ev: 'display', ptyId, data: Buffer.from(data).toString('base64') })
        })
      )
    }
    if (wanted.has('cursor')) {
      stop.push(
        this.manager.onCursorSync(ptyId, (cursor) => {
          this.emit({ ev: 'cursor', ptyId, row: cursor.row, column: cursor.column })
        })
      )
    }
    this.subs.set(subId, { subId, ptyId, stop })
    return subId
  }

  private unsubscribe(subId: number): void {
    const live = this.subs.get(subId)
    if (!live) return
    for (const stop of live.stop) stop()
    this.subs.delete(subId)
  }
}
