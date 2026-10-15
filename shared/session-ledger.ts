/**
 * ASC 自己的会话账本。
 *
 * 和各家 CLI 的历史文件分开：历史扫描只读，这里只记 ASC 启动过的会话。
 * 进程还在时重进是重连；进程没了，才按 agentSessionKey 恢复。
 * 对话正文仍在 CLI 自己的文件里，账本只存钥匙和启动定义。
 */

export type LedgerStatus = 'running' | 'stopped' | 'crashed'

export interface SessionLedgerRow {
  /** ASC 自己的稳定 id，重进、分叉、飞书卡片都用它。 */
  id: string
  agentId: string
  installationId: string
  /** 那家 CLI 自己的对话 id。没有钥匙就不能按原对话恢复。 */
  agentSessionKey: string | null
  name: string
  cwd: string
  /** 当时的启动参数，恢复时不跟后来改过的配置。 */
  args: string[]
  cols: number
  rows: number
  status: LedgerStatus
  /** 退出或崩溃前打上，下次启动只拉这些。 */
  resumeOnLaunch: boolean
  startedAt: number
  updatedAt: number
  stoppedAt: number | null
  /** 终端宿主里的 pty 编号。窗口重开时靠它重连，不新开进程。 */
  hostPtyId: string | null
  terminalId: string | null
}

export interface SessionLedgerUpsert {
  id: string
  agentId: string
  installationId: string
  name: string
  cwd: string
  args: readonly string[]
  cols: number
  rows: number
  agentSessionKey?: string | null
  hostPtyId?: string | null
  terminalId?: string | null
}

const MAX_KEY_LENGTH = 256

/** 从启动参数里取出 CLI 已经认的对话 id。没有就等 observer 再写。 */
export function extractAgentSessionKey(
  agentId: string,
  args: readonly string[]
): string | null {
  const tokens = args.map((arg) => arg.trim()).filter(Boolean)
  if (agentId === 'codex') {
    const index = tokens.findIndex((token) => token === 'resume')
    return index >= 0 ? cleanKey(tokens[index + 1]) : null
  }
  const flags = ['--resume', '--session-id', '--conversation', '-r']
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const inline = flags.find((flag) => token.startsWith(`${flag}=`))
    if (inline) return cleanKey(token.slice(inline.length + 1))
    if (flags.includes(token)) return cleanKey(tokens[index + 1])
  }
  return null
}

function cleanKey(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('-') || trimmed.length > MAX_KEY_LENGTH) {
    return null
  }
  return trimmed
}
