/**
 * Electron 主进程与终端宿主之间的管道协议。
 * 宿主是普通 Node 进程，握着 node-pty。窗口只是客户端。
 */
import type {
  ExitPayload,
  PtyFlowControlSnapshot,
  PtyHistorySnapshot,
  RecoverablePty,
  SpawnOptions
} from '../../shared/ipc-contract'

import { userInfo } from 'node:os'

export const HOST_PROTOCOL = 1

/** 一台电脑、一个用户只开一个终端宿主。窗口是客户端。 */
export function ptyHostPipeName(username = userInfo().username): string {
  const safe = username.replace(/[^A-Za-z0-9_.-]/g, '_') || 'user'
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\asc-pty-${safe}`
    : `/tmp/asc-pty-${safe}.sock`
}

export type HostRequest =
  | { id: number; op: 'spawn'; opts: SpawnOptions }
  | { id: number; op: 'write'; ptyId: string; data: string }
  | { id: number; op: 'resize'; ptyId: string; cols: number; rows: number }
  | { id: number; op: 'ack'; ptyId: string; bytes: number }
  | { id: number; op: 'kill'; ptyId: string }
  | { id: number; op: 'kill-terminal'; terminalId: string }
  | { id: number; op: 'kill-all' }
  | { id: number; op: 'attach'; ptyId: string }
  | { id: number; op: 'history'; ptyId: string }
  | { id: number; op: 'display-history'; ptyId: string }
  | { id: number; op: 'flow'; ptyId: string }
  | { id: number; op: 'list' }
  | { id: number; op: 'pty-for-terminal'; terminalId: string }
  | { id: number; op: 'is-running'; ptyId: string }
  | { id: number; op: 'last-output-at'; ptyId: string }
  | { id: number; op: 'acquire-remote'; ptyId: string; owner: string; cols: number; rows: number }
  | { id: number; op: 'resize-remote'; ptyId: string; owner: string; cols: number; rows: number }
  | { id: number; op: 'release-remote'; ptyId: string; owner: string }
  | { id: number; op: 'pause'; ptyId: string; owner: string }
  | { id: number; op: 'resume'; ptyId: string; owner: string }
  | { id: number; op: 'subscribe'; ptyId: string; kinds: HostEventKind[] }
  | { id: number; op: 'unsubscribe'; ptyId: string; subId: number }
  | { id: number; op: 'hello' }
  | { id: number; op: 'shutdown' }

export type HostEventKind =
  | 'data'
  | 'exit'
  | 'cursor'
  | 'output'
  | 'display'
  | 'input'
  | 'terminal-removed'

export type HostEvent =
  | { ev: 'data'; ptyId: string; data: string }
  | { ev: 'exit'; ptyId: string; payload: ExitPayload }
  | { ev: 'cursor'; ptyId: string; row: number; column: number }
  | { ev: 'output'; ptyId: string; data: string }
  | { ev: 'display'; ptyId: string; data: string }
  | { ev: 'input'; ptyId: string }
  | { ev: 'terminal-removed'; terminalId: string }
  | { ev: 'ready'; protocol: number }

export type HostResult =
  | { id: number; ok: true; value?: unknown }
  | { id: number; ok: false; error: string }

export interface HostSpawnValue {
  ptyId: string
}

export function isHostEvent(value: unknown): value is HostEvent {
  return Boolean(value && typeof value === 'object' && 'ev' in value)
}

export type HostSnapshot = PtyHistorySnapshot | null
export type HostFlow = PtyFlowControlSnapshot | null
export type HostRecoverable = RecoverablePty[]
