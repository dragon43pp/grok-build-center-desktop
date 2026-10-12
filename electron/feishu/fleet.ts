/**
 * 多电脑飞书的纯逻辑：谁在线、名字对上哪台、序号落在哪一场、命令号怎么排重。
 *
 * 不碰网络、不碰磁盘。长连接是集群模式，同一条消息只会随机落到一台已连接的
 * ASC 上，所以「序号 → 会话」不能只活在收到 /列表 的那个进程里。这里只规定
 * 对照规则；读写共享表在 `fleet-store.ts`。
 */

export const FLEET_ONLINE_MS = 90_000
export const FLEET_INDEX_TTL_MS = 30 * 60 * 1000

export const FLEET_TABLE_COMPUTERS = '电脑'
export const FLEET_TABLE_COMMANDS = '命令'
export const FLEET_TABLE_SLOTS = '序号'

export interface FleetComputer {
  id: string
  name: string
  seenAt: number
}

export interface FleetSlot {
  n: number
  computerId: string
  computerName: string
  sid: string
  agent: string
  title: string
}

export type ComputerMatch =
  | { kind: 'one'; computer: FleetComputer }
  | { kind: 'none' }
  | { kind: 'many'; names: string[] }

export function isOnline(
  computer: FleetComputer,
  now: number,
  windowMs = FLEET_ONLINE_MS
): boolean {
  return Number.isFinite(computer.seenAt) && now - computer.seenAt <= windowMs
}

function fold(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * 点名一台电脑。
 *
 * 先精确（id 或名字，忽略大小写），再唯一前缀。对上多台就要求说全，
 * 不许猜 —— 猜错会在另一台电脑上打开会话。
 */
export function matchComputer(
  computers: readonly FleetComputer[],
  query: string,
  now: number
): ComputerMatch {
  const needle = fold(query)
  if (!needle) return { kind: 'none' }
  const exact = computers.filter(
    (computer) => fold(computer.id) === needle || fold(computer.name) === needle
  )
  if (exact.length === 1) return { kind: 'one', computer: exact[0]! }
  if (exact.length > 1) {
    return { kind: 'many', names: exact.map((computer) => computer.name) }
  }
  const prefixed = computers.filter((computer) => fold(computer.name).startsWith(needle))
  if (prefixed.length === 1) return { kind: 'one', computer: prefixed[0]! }
  if (prefixed.length > 1) {
    return { kind: 'many', names: prefixed.map((computer) => computer.name) }
  }
  void now
  return { kind: 'none' }
}

/** 飞书文本 / 单选格子里把值挖成字符串。单选有时是数组，富文本有时是 `{text}`。 */
export function cellText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text: unknown }).text ?? '')
        }
        return ''
      })
      .join('')
  }
  return ''
}

export function cellNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = cellText(value)
  if (!text) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * `/继续 办公室 3 开始干活` → 电脑名 + 序号 + 剩下的话。
 * 第一个 1–999 的词是序号；它前面的词拼成电脑名。没有序号就只有电脑名。
 */
export function splitComputerAndIndex(tokens: readonly string[]): {
  computer?: string
  n?: number
  rest: string[]
} {
  const indexAt = tokens.findIndex((token) => /^[1-9]\d{0,2}$/.test(token))
  if (indexAt < 0) {
    const computer = tokens.join(' ').trim()
    return { ...(computer ? { computer } : {}), rest: [] }
  }
  const computer = tokens.slice(0, indexAt).join(' ').trim()
  const n = Number(tokens[indexAt])
  return {
    ...(computer ? { computer } : {}),
    n,
    rest: tokens.slice(indexAt + 1)
  }
}

/** 同一条飞书消息重投时必须落到同一条命令上，避免两台电脑各打开一次。 */
export function commandKey(messageId: string | null, action: string, detail: string): string {
  const base = `${messageId || 'nomsg'}:${action}:${detail}`
  return base.slice(0, 180)
}

export function slotByNumber<T extends { n?: number; computerId?: string; computerName?: string }>(
  slots: readonly T[],
  n: number,
  computerName?: string
): T | null {
  const ranked = computerName
    ? slots.filter(
        (slot) =>
          fold(slot.computerName ?? '') === fold(computerName) ||
          fold(slot.computerId ?? '') === fold(computerName)
      )
    : slots
  return ranked.find((slot) => slot.n === n) ?? null
}

export function describeComputers(
  computers: readonly FleetComputer[],
  self: { id: string; name: string },
  now: number
): string {
  const merged = new Map<string, FleetComputer>()
  for (const computer of computers) merged.set(computer.id, computer)
  const own = merged.get(self.id)
  merged.set(self.id, {
    id: self.id,
    name: own?.name || self.name,
    seenAt: Math.max(own?.seenAt ?? 0, now)
  })
  const lines = [...merged.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    .map((computer) => {
      const mark = computer.id === self.id ? '（收到这条消息的电脑）' : ''
      const state = isOnline(computer, now) ? '在线' : '不在线'
      return `- ${computer.name} · ${state}${mark}`
    })
  return ['**电脑**', ...lines, '', '看某一台：/列表 电脑名', '在某一台继续：/继续 电脑名 序号'].join('\n')
}

/** 从多维表格链接或裸 token 里取出 app_token。认 `/base/<token>`。 */
export function appTokenFromBitableUrl(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  if (/^[A-Za-z0-9]{10,}$/.test(text)) return text
  try {
    const url = new URL(text)
    const parts = url.pathname.split('/').filter(Boolean)
    const baseIndex = parts.findIndex((part) => part === 'base' || part === 'bitable')
    const token = baseIndex >= 0 ? parts[baseIndex + 1] : undefined
    if (token && /^[A-Za-z0-9]+$/.test(token)) return token
  } catch {
    return null
  }
  return null
}
