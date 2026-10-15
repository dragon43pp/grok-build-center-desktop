/**
 * 飞书入站路由 —— 「在飞书上继续会话」这一半。
 *
 * 出站（状态推送、多维表格、引导卡）在 `provision.ts`；这里管**入站**：
 * 机器人收到消息 / 卡片按钮被点，变成对会话的真实操作。
 *
 * ## 指令面（刻意小）
 *
 *   /列表            最近可恢复的历史会话（卡片，带按钮）
 *   /继续 <序号>      在电脑上打开那场会话 —— 手机做决定，电脑接着聊
 *   /打开            打开上次的国内 WorkBuddy 会话（不选模型、不投喂）
 *   /会话            现在开着的会话
 *   /发 <序号> <文字>  往开着的会话里投喂一句话
 *   /问题            现在等你回答的任务问题
 *   /答 <问题编号> <答案>  按编号作答，和命令行答的是同一题
 *   /帮助            用法
 *
 * 「手机上替它跑完一整场」还做不到也不急着做：resume 是在电脑上开标签页，
 * 投喂只对已打开且空闲的会话生效。这是诚实的能力边界，不是偷懒。
 *
 * ## 安全
 *
 * 只应答 `pairedUsers` 名单里的人（`isPaired`），单聊之外一概忽略。
 * 名单是扫码时写死的，不存在「发条消息就能配对」的口子。
 *
 * ## 不抛错
 *
 * 入站回调抛错会被 SDK 吞掉或变成未处理拒绝 —— 全部折成给用户的
 * 一句人话回复。用户看到的永远不是沉默。
 */

import type {
  BridgeHistorySession,
  BridgeResumeResult,
  BridgeSessionInfo
} from '../../shared/bridge-protocol'
import type {
  FeishuInboundCardAction,
  FeishuInboundMessage,
  FeishuOutboundMessage
} from './channel'
import { cliOptionOf } from './bitable'
import {
  commandKey,
  describeComputers,
  isOnline,
  matchComputer,
  slotByNumber,
  splitComputerAndIndex,
  type FleetComputer,
  type FleetSlot
} from './fleet'

export interface FeishuRouterDeps {
  /** 磁盘上的历史会话（`sessions.history`）。 */
  history: () => Promise<BridgeHistorySession[]>
  /** 现在开着的会话（`sessions.list`）。 */
  listActive: () => Promise<BridgeSessionInfo[]>
  /**
   * 恢复一场历史会话（`session.resume`）—— 在电脑上开新标签页。
   * `model` 可选：给定时恢复命令带 `--model`（三个已收录 CLI 都实测有这面旗）。
   */
  resume: (
    sessionId: string,
    agent?: string,
    model?: string
  ) => Promise<BridgeResumeResult>
  /** 某个 CLI 可选的模型清单（「默认」之外的选择）。空数组 = 只有默认。 */
  getModels: (agent: string) => string[]
  /** 往开着的会话里发一句话（`session.send`）。 */
  send: (
    sessionId: string,
    text: string,
    agent?: string
  ) => Promise<{ accepted: true; mode: string }>
  /** 给单个用户回消息。失败只记日志，绝不往上抛。 */
  sendTo: (openId: string, message: FeishuOutboundMessage) => Promise<unknown>
  /** 准入名单判定。不在名单里的人发什么都不理。 */
  isPaired: (openId: string) => boolean
  /**
   * 打开上次的国内 WorkBuddy 会话。不走终端、不选模型、不投喂。
   * 没接上时 /打开 会说明，列表卡也不放这个按钮。
   */
  openLatestWorkbuddy?: () => Promise<{ ok: boolean; message: string }>
  /**
   * 在电脑上的 DSH 界面打开一场 dsh 会话（省略 sessionId = 最近一场）。
   * dsh 没有终端恢复命令，所以「继续 dsh」= 把这一场交给 ASC 的 DSH 界面，
   * 而不是往终端里投喂。
   */
  openDshSession?: (sessionId?: string) => Promise<{ ok: boolean; message: string }>
  /** 现在等你回答的任务问题。 */
  listTaskQuestions?: () => Promise<Array<{ id: string; prompt: string; choices: string[] }>>
  /** 按问题编号作答。和 asc tasks answer 是同一条账本。 */
  answerTaskQuestion?: (
    questionId: string,
    answer: string
  ) => Promise<{ ok: true; alreadyAnswered: boolean; delivered: boolean } | null>
  /** 「恢复后自动投喂」的轮询节奏，判卷用小值。默认 3 秒一次、最多等 45 秒。 */
  pollIntervalMs?: number
  pollTimeoutMs?: number
  /**
   * 多电脑调度。不传时所有指令都在收到消息的这台电脑上执行（单机、离线判卷）。
   * 传了之后，点名别的电脑会写进共享表，由那台电脑执行并把结果发回对话。
   */
  fleet?: FeishuFleetPort
}

export interface FeishuFleetPort {
  self: () => { id: string; name: string }
  computers: () => Promise<FleetComputer[]>
  enqueue: (command: {
    id: string
    targetId: string
    action: string
    payload: Record<string, unknown>
    openId: string
  }) => Promise<'created' | 'exists'>
  publishSlots: (openId: string, kind: 'history' | 'active', slots: FleetSlot[]) => Promise<void>
  readSlots: (openId: string, kind: 'history' | 'active') => Promise<FleetSlot[] | null>
  remoteSessions: (
    computerId: string
  ) => Promise<Array<{ sid: string; agent: string; title: string }>>
}

// ------------------------------------------------------------------ 指令解析

export type RouterCommand =
  | { cmd: 'help' }
  | { cmd: 'computers' }
  | { cmd: 'list'; computer?: string }
  | { cmd: 'active'; computer?: string }
  | { cmd: 'resume'; n: number; text?: string; computer?: string }
  | { cmd: 'send'; n: number; text: string; computer?: string }
  | { cmd: 'open-workbuddy'; computer?: string }
  | { cmd: 'open-dsh'; computer?: string }
  | { cmd: 'questions' }
  | { cmd: 'answer'; questionId: string; answer: string }
  | { cmd: 'unknown' }

export function parseCommand(rawText: string): RouterCommand {
  const text = rawText.trim()
  if (!text.startsWith('/')) return { cmd: 'unknown' }
  const parts = text.split(/\s+/)
  const word = parts[0]!.slice(1).toLowerCase()
  const tail = parts.slice(1)
  const named = splitComputerAndIndex(tail)

  if (word === '帮助' || word === 'help') return { cmd: 'help' }
  if (word === '电脑' || word === 'computers' || word === 'computer') return { cmd: 'computers' }
  if (word === '列表' || word === 'list') {
    return { cmd: 'list', ...(named.computer ? { computer: named.computer } : {}) }
  }
  if (word === '会话' || word === 'sessions') {
    return { cmd: 'active', ...(named.computer ? { computer: named.computer } : {}) }
  }
  if (word === '打开' || word === 'open') {
    const computer = tail.join(' ').trim()
    return { cmd: 'open-workbuddy', ...(computer ? { computer } : {}) }
  }
  if (word === 'dsh') {
    const computer = tail.join(' ').trim()
    return { cmd: 'open-dsh', ...(computer ? { computer } : {}) }
  }
  if (word === '继续' || word === 'resume') {
    if (!named.n) return { cmd: 'unknown' }
    const body = named.rest.join(' ').trim()
    return {
      cmd: 'resume',
      n: named.n,
      ...(named.computer ? { computer: named.computer } : {}),
      ...(body ? { text: body } : {})
    }
  }
  if (word === '问题' || word === 'questions') return { cmd: 'questions' }
  if (word === '答' || word === 'answer') {
    const questionId = tail[0]?.trim()
    const answer = tail.slice(1).join(' ').trim()
    if (!questionId || !answer) return { cmd: 'unknown' }
    return { cmd: 'answer', questionId, answer }
  }
  if (word === '发' || word === 'send') {
    if (!named.n) return { cmd: 'unknown' }
    const body = named.rest.join(' ').trim()
    if (!body) return { cmd: 'unknown' }
    return {
      cmd: 'send',
      n: named.n,
      text: body,
      ...(named.computer ? { computer: named.computer } : {})
    }
  }
  return { cmd: 'unknown' }
}

// ------------------------------------------------------------------ 小工具

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** `2026-10-01T08:15:00Z` → `10-01 16:15`（本机时区）。没有就给 —。 */
function fmtTime(iso: string | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const STATUS_LABELS: Record<string, string> = {
  working: '🟢 运行中',
  needsYou: '🟠 等你确认',
  done: '✅ 完成',
  error: '🔴 出错',
  idle: '⚪ 空闲',
  exited: '⚫ 已退出'
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

// ------------------------------------------------------------------ 卡片

function button(
  n: number,
  item: { sid: string; agent: string; title: string; computerId?: string; computerName?: string }
) {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: String(n) },
    type: 'primary',
    // 点下去先**选模型**（pick），选定后才真正 resume —— 见 onCardAction。
    // computerId 让按钮落到任意一台长连接上都能交回拥有文件的那台。
    value: {
      cmd: 'pick',
      sid: item.sid,
      agent: item.agent,
      title: item.title,
      ...(item.computerId ? { computerId: item.computerId, computerName: item.computerName ?? '' } : {})
    }
  }
}

/** 选模型卡片：默认 + 该 CLI 的可选模型。 */
function modelPickerCard(input: {
  sid: string
  agent: string
  title: string
  models: string[]
  computerId?: string
  computerName?: string
}): Record<string, unknown> {
  const resumeValue = (model?: string) => ({
    cmd: 'resume',
    sid: input.sid,
    agent: input.agent,
    title: input.title,
    ...(model ? { model } : {}),
    ...(input.computerId
      ? { computerId: input.computerId, computerName: input.computerName ?? '' }
      : {})
  })
  const actions: Array<Record<string, unknown>> = [
    {
      tag: 'button',
      text: { tag: 'plain_text', content: '默认（不指定）' },
      type: 'primary',
      value: resumeValue()
    },
    ...input.models.map((model) => ({
      tag: 'button',
      text: { tag: 'plain_text', content: model },
      type: 'default',
      value: resumeValue(model)
    }))
  ]
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: `选择模型 · ${truncate(input.title, 30)}` }
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: `CLI：${cliOptionOf(input.agent)}` } },
      { tag: 'action', actions },
      {
        tag: 'note',
        elements: [
          { tag: 'plain_text', content: '选定后会在电脑上打开这场会话' }
        ]
      }
    ]
  }
}

function helpCard(): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: '会话助手 · 用法' }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: [
            '**/电脑** —— 哪些电脑在线',
            '**/列表 [电脑名]** —— 最近可恢复的历史会话（点序号 → 选模型 → 在那台电脑上打开）',
            '**/继续 [电脑名] 序号 [第一句话]** —— 打开会话；带上话就自动投喂，它直接开跑',
            '**/打开 [电脑名]** —— 打开那台电脑上上次的国内 WorkBuddy 会话（不选模型，不自动发消息）',
            '**/dsh [电脑名]** —— 在那台电脑的 DSH 界面打开最近一场 DeepSeek Harness 会话',
            '**/会话 [电脑名]** —— 那台电脑上现在开着的会话',
            '**/发 [电脑名] 序号 一句话** —— 往开着的会话里投喂一句话',
            '**/问题** —— 这台电脑上正在等你回答的任务问题',
            '**/答 问题编号 答案** —— 按编号作答。批准写 approved，拒绝写 denied'
          ].join('\n')
        }
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: [
            '**能力边界**',
            '- 多台电脑共用这一个机器人。会话在拥有文件的那台电脑上打开，不会在另一台打开',
            '- 「继续」是在那台电脑上开标签页：手机上做决定，回到那台电脑就能接着聊',
            '- 「打开」只开国内 WorkBuddy 里最近一场，国际版不在这里恢复',
            '- 「/dsh」只开最近一场；dsh 没有终端恢复命令，所以它不进 /列表 的序号',
            '- 「发」只对**开着的**会话生效；会话正忙时不收',
            '- 列表序号 30 分钟内有效，过期重发 /列表'
          ].join('\n')
        }
      }
    ]
  }
}

interface CachedItem {
  sid: string
  agent: string
  title: string
  n?: number
  computerId?: string
  computerName?: string
}

const CACHE_TTL_MS = 30 * 60 * 1000

// ------------------------------------------------------------------ 路由本体

export interface FleetLocalCommand {
  openId: string
  action: string
  payload: Record<string, unknown>
}

export function createFeishuRouter(deps: FeishuRouterDeps): {
  onMessage: (message: FeishuInboundMessage) => Promise<void>
  onCardAction: (action: FeishuInboundCardAction) => Promise<unknown>
  /** 别的电脑交过来的命令，在本机执行并把结果发回对话。 */
  executeLocal: (command: FleetLocalCommand) => Promise<void>
} {
  /** 「序号 → 会话」的对照表，/列表 和 /会话 时各自刷新。 */
  const historyCache = new Map<string, { items: CachedItem[]; at: number }>()
  const activeCache = new Map<string, { items: CachedItem[]; at: number }>()
  const pollIntervalMs = deps.pollIntervalMs ?? 3_000
  const pollTimeoutMs = deps.pollTimeoutMs ?? 45_000

  const cacheGet = (
    cache: Map<string, { items: CachedItem[]; at: number }>,
    openId: string
  ): CachedItem[] | null => {
    const entry = cache.get(openId)
    if (!entry || Date.now() - entry.at > CACHE_TTL_MS) return null
    return entry.items
  }

  const cachePut = (
    cache: Map<string, { items: CachedItem[]; at: number }>,
    openId: string,
    items: CachedItem[]
  ): void => {
    cache.set(openId, { items, at: Date.now() })
  }

  async function sendText(openId: string, text: string): Promise<void> {
    await deps.sendTo(openId, { text })
  }

  const selfComputer = (): { id: string; name: string } | null => {
    if (!deps.fleet) return null
    try {
      return deps.fleet.self()
    } catch {
      return null
    }
  }

  const taggedValue = (value: Record<string, unknown>): Record<string, unknown> => {
    const self = selfComputer()
    if (!self) return value
    return { ...value, computerId: self.id, computerName: self.name }
  }

  const workbuddyButton = (): Record<string, unknown> | null =>
    deps.openLatestWorkbuddy
      ? {
          tag: 'button',
          text: { tag: 'plain_text', content: '打开上次的 WorkBuddy' },
          type: 'default',
          value: taggedValue({ cmd: 'open-workbuddy' })
        }
      : null

  const dshButton = (): Record<string, unknown> | null =>
    deps.openDshSession
      ? {
          tag: 'button',
          text: { tag: 'plain_text', content: '打开最近的 DSH' },
          type: 'default',
          value: taggedValue({ cmd: 'open-dsh' })
        }
      : null

  async function handoff(
    messageId: string | null,
    openId: string,
    action: string,
    target: FleetComputer,
    payload: Record<string, unknown>
  ): Promise<string> {
    const id = commandKey(messageId, action, `${target.id}:${String(payload['sid'] ?? payload['n'] ?? '')}`)
    try {
      const result = await deps.fleet!.enqueue({
        id,
        targetId: target.id,
        action,
        payload,
        openId
      })
      if (result === 'exists') return `已经交给「${target.name}」了。`
      return `已交给「${target.name}」。结果会发到这个对话。`
    } catch (error) {
      return `没交给「${target.name}」：${messageOf(error)}`
    }
  }

  async function resolveNamed(
    name: string
  ): Promise<
    | { kind: 'self' }
    | { kind: 'remote'; computer: FleetComputer }
    | { kind: 'error'; message: string }
  > {
    if (!deps.fleet) {
      return { kind: 'error', message: '多电脑名单还没接上。先在设置里连上飞书。' }
    }
    const self = deps.fleet.self()
    let computers: FleetComputer[] = []
    try {
      computers = await deps.fleet.computers()
    } catch (error) {
      return { kind: 'error', message: `还读不到电脑名单：${messageOf(error)}` }
    }
    const now = Date.now()
    if (!computers.some((computer) => computer.id === self.id)) {
      computers = [{ id: self.id, name: self.name, seenAt: now }, ...computers]
    }
    const match = matchComputer(computers, name, now)
    if (match.kind === 'none') {
      const names = computers.map((computer) => computer.name).join('、') || self.name
      return { kind: 'error', message: `没有叫「${name}」的电脑。现在有：${names}` }
    }
    if (match.kind === 'many') {
      return {
        kind: 'error',
        message: `「${name}」对上了多台：${match.names.join('、')}。把名字说全。`
      }
    }
    if (match.computer.id === self.id) return { kind: 'self' }
    if (!isOnline(match.computer, now)) {
      return {
        kind: 'error',
        message: `「${match.computer.name}」不在线。先在那台电脑上打开本应用。`
      }
    }
    return { kind: 'remote', computer: match.computer }
  }

  async function handoffById(
    messageId: string | null,
    openId: string,
    action: string,
    computerId: string,
    computerName: string,
    payload: Record<string, unknown>
  ): Promise<{ text: string; ok: boolean }> {
    if (!deps.fleet) return { text: '多电脑名单还没接上。', ok: false }
    const self = deps.fleet.self()
    if (computerId === self.id) return { text: '', ok: false }
    let computers: FleetComputer[] = []
    try {
      computers = await deps.fleet.computers()
    } catch (error) {
      return { text: `还读不到电脑名单：${messageOf(error)}`, ok: false }
    }
    const now = Date.now()
    const target =
      computers.find((computer) => computer.id === computerId) ??
      ({ id: computerId, name: computerName || computerId, seenAt: 0 } satisfies FleetComputer)
    if (!isOnline(target, now)) {
      return { text: `「${target.name}」不在线。先在那台电脑上打开本应用。`, ok: false }
    }
    return { text: await handoff(messageId, openId, action, target, payload), ok: true }
  }

  async function publishHistorySlots(openId: string, items: CachedItem[]): Promise<void> {
    cachePut(historyCache, openId, items)
    if (!deps.fleet) return
    const self = selfComputer()
    if (!self) return
    try {
      await deps.fleet.publishSlots(
        openId,
        'history',
        items.map((item, index) => ({
          n: index + 1,
          computerId: item.computerId || self.id,
          computerName: item.computerName || self.name,
          sid: item.sid,
          agent: item.agent,
          title: item.title
        }))
      )
    } catch (error) {
      console.log('[feishu-router] 序号没写进共享表：%s', messageOf(error))
    }
  }

  async function sendList(
    openId: string,
    messageId: string | null = null,
    computerName?: string
  ): Promise<void> {
    if (computerName) {
      const named = await resolveNamed(computerName)
      if (named.kind === 'error') {
        await sendText(openId, named.message)
        return
      }
      if (named.kind === 'remote') {
        await sendText(openId, await handoff(messageId, openId, 'list', named.computer, {}))
        return
      }
    } else if (await sendCombinedList(openId)) {
      return
    }
    await sendLocalList(openId)
  }

  /** 多台在线时发一张按电脑分组的列表。只有本机在线时返回 false，走原来的单机列表。 */
  async function sendCombinedList(openId: string): Promise<boolean> {
    if (!deps.fleet) return false
    const self = deps.fleet.self()
    let computers: FleetComputer[] = []
    try {
      computers = await deps.fleet.computers()
    } catch {
      return false
    }
    const now = Date.now()
    const online = computers.filter((computer) => isOnline(computer, now) && computer.id !== self.id)
    if (online.length === 0) return false

    const items: CachedItem[] = []
    const own = (await deps.history()).filter((session) => session.resumable).slice(0, 6)
    for (const session of own) {
      items.push({
        sid: session.sessionId,
        agent: session.agent,
        title: session.title,
        computerId: self.id,
        computerName: self.name
      })
    }
    for (const computer of online) {
      let remote: Array<{ sid: string; agent: string; title: string }> = []
      try {
        remote = await deps.fleet.remoteSessions(computer.id)
      } catch {
        remote = []
      }
      for (const session of remote.slice(0, 4)) {
        if (items.length >= 10) break
        items.push({
          sid: session.sid,
          agent: session.agent,
          title: session.title,
          computerId: computer.id,
          computerName: computer.name
        })
      }
    }
    const top = items.slice(0, 10)
    await publishHistorySlots(openId, top)
    if (top.length === 0) {
      await sendText(openId, '这几台在线的电脑上还没有可恢复的会话。')
      return true
    }
    const lines = top.map(
      (item, index) =>
        `**${index + 1}.** ${truncate(item.title.trim() || '(未命名)', 40)}\n${item.computerName || self.name} · ${cliOptionOf(item.agent)}`
    )
    const actions = top.map((item, index) => button(index + 1, item))
    const grouped: Array<Array<Record<string, unknown>>> = []
    for (let i = 0; i < actions.length; i += 5) grouped.push(actions.slice(i, i + 5))
    await deps.sendTo(openId, {
      card: {
        config: { wide_screen_mode: true },
        header: {
          template: 'blue',
          title: { tag: 'plain_text', content: `最近可恢复 ${top.length} 场` }
        },
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } },
          ...grouped.map((group) => ({ tag: 'action', actions: group })),
          {
            tag: 'note',
            elements: [
              {
                tag: 'plain_text',
                content: '序号带电脑名。点序号会在拥有这场会话的电脑上打开。只看一台：/列表 电脑名'
              }
            ]
          }
        ]
      }
    })
    return true
  }

  async function sendLocalList(openId: string): Promise<void> {
    const self = selfComputer()
    const resumable = (await deps.history()).filter((session) => session.resumable)
    const openButton = workbuddyButton()
    const dshOpenButton = dshButton()
    if (resumable.length === 0) {
      const fallbackButtons = [openButton, dshOpenButton].filter(
        (item): item is Record<string, unknown> => item !== null
      )
      if (fallbackButtons.length === 0) {
        await sendText(openId, '这台电脑上还没有可恢复的会话。先在桌面端跑几场再来。')
        return
      }
      await deps.sendTo(openId, {
        card: {
          config: { wide_screen_mode: true },
          header: {
            template: 'blue',
            title: { tag: 'plain_text', content: '没有可在终端恢复的会话' }
          },
          elements: [
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content:
                  '终端会话还没有。国内 WorkBuddy 和 DSH 各自还能打开最近那场。'
              }
            },
            { tag: 'action', actions: fallbackButtons }
          ]
        }
      })
      return
    }
    const top = resumable.slice(0, 10)
    const items = top.map((session) => ({
      sid: session.sessionId,
      agent: session.agent,
      title: session.title,
      ...(self ? { computerId: self.id, computerName: self.name } : {})
    }))
    await publishHistorySlots(openId, items)

    const lines = top.map(
      (session, index) =>
        `**${index + 1}.** ${truncate(session.title.trim() || '(未命名)', 40)}\n${self ? `${self.name} · ` : ''}${cliOptionOf(session.agent)} · ${fmtTime(session.updatedAt)}`
    )
    // 按钮一次最多 10 个，拆成两排稳妥。
    const actions = items.map((item, index) => button(index + 1, item))
    const grouped: Array<Array<Record<string, unknown>>> = []
    for (let i = 0; i < actions.length; i += 5) grouped.push(actions.slice(i, i + 5))
    const extraButtons = [openButton, dshOpenButton].filter(
      (item): item is Record<string, unknown> => item !== null
    )

    await deps.sendTo(openId, {
      card: {
        config: { wide_screen_mode: true },
        header: {
          template: 'blue',
          title: { tag: 'plain_text', content: `最近可恢复 ${top.length} 场` }
        },
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } },
          ...grouped.map((group) => ({ tag: 'action', actions: group })),
          ...(extraButtons.length > 0 ? [{ tag: 'action', actions: extraButtons }] : []),
          {
            tag: 'note',
            elements: [
              {
                tag: 'plain_text',
                content: openButton
                  ? '点序号选模型，选完在电脑上打开；「打开上次的 WorkBuddy」不选模型。序号 30 分钟内有效'
                  : '点序号选模型，选完在电脑上打开；序号 30 分钟内有效'
              }
            ]
          }
        ]
      }
    })
  }

  async function sendActiveList(
    openId: string,
    messageId: string | null = null,
    computerName?: string
  ): Promise<void> {
    if (computerName) {
      const named = await resolveNamed(computerName)
      if (named.kind === 'error') {
        await sendText(openId, named.message)
        return
      }
      if (named.kind === 'remote') {
        await sendText(openId, await handoff(messageId, openId, 'active', named.computer, {}))
        return
      }
    }
    const active = await deps.listActive()
    if (active.length === 0) {
      await sendText(
        openId,
        '电脑上现在没有开着的会话。要续旧的发 /列表，要新开就回电脑。'
      )
      return
    }
    const self = selfComputer()
    const top = active.slice(0, 10)
    const items = top.map((session) => ({
      sid: session.sessionId,
      agent: session.adapterId ?? session.agent ?? '',
      title: session.name,
      ...(self ? { computerId: self.id, computerName: self.name } : {})
    }))
    cachePut(activeCache, openId, items)
    if (deps.fleet && self) {
      try {
        await deps.fleet.publishSlots(
          openId,
          'active',
          items.map((item, index) => ({
            n: index + 1,
            computerId: item.computerId || self.id,
            computerName: item.computerName || self.name,
            sid: item.sid,
            agent: item.agent,
            title: item.title
          }))
        )
      } catch (error) {
        console.log('[feishu-router] 活动序号没写进共享表：%s', messageOf(error))
      }
    }
    const lines = top.map(
      (session, index) =>
        `**${index + 1}.** ${truncate(session.name.trim() || '(未命名)', 40)}\n${statusLabel(session.status)} · ${session.workspace || '无目录'}`
    )
    await sendText(openId, lines.join('\n') + '\n\n投喂：/发 序号 一句话')
  }

  async function historyItems(openId: string): Promise<CachedItem[] | null> {
    if (deps.fleet) {
      try {
        const shared = await deps.fleet.readSlots(openId, 'history')
        if (shared && shared.length > 0) {
          return shared.map((slot) => ({
            sid: slot.sid,
            agent: slot.agent,
            title: slot.title,
            n: slot.n,
            computerId: slot.computerId,
            computerName: slot.computerName
          }))
        }
      } catch {
        // 共享表读失败就用本进程刚发出去的列表。
      }
    }
    return cacheGet(historyCache, openId)
  }

  function stringField(value: unknown): string {
    return typeof value === 'string' ? value : ''
  }

  async function runNamed(
    messageId: string | null,
    openId: string,
    computerName: string | undefined,
    action: string,
    payload: Record<string, unknown>,
    local: () => Promise<string>,
    ignoreWhenNoFleet = false
  ): Promise<string> {
    if (!computerName) return local()
    if (!deps.fleet && ignoreWhenNoFleet) return local()
    const named = await resolveNamed(computerName)
    if (named.kind === 'error') return named.message
    if (named.kind === 'remote') return handoff(messageId, openId, action, named.computer, payload)
    return local()
  }

  async function sendComputers(openId: string): Promise<void> {
    if (!deps.fleet) {
      await sendText(openId, '这台电脑还没接上多电脑名单。先在设置里连上飞书。')
      return
    }
    const self = deps.fleet.self()
    try {
      const computers = await deps.fleet.computers()
      await sendText(openId, describeComputers(computers, self, Date.now()))
    } catch (error) {
      await sendText(openId, `还读不到电脑名单：${messageOf(error)}`)
    }
  }

  async function activeItems(openId: string): Promise<CachedItem[] | null> {
    if (deps.fleet) {
      try {
        const shared = await deps.fleet.readSlots(openId, 'active')
        if (shared && shared.length > 0) {
          return shared.map((slot) => ({
            sid: slot.sid,
            agent: slot.agent,
            title: slot.title,
            n: slot.n,
            computerId: slot.computerId,
            computerName: slot.computerName
          }))
        }
      } catch {
        // 共享表读失败就用本进程刚发出去的活动列表。
      }
    }
    return cacheGet(activeCache, openId)
  }

  async function openAndMaybeFeed(
    item: { sid: string; agent: string; title: string },
    model: string | undefined,
    text: string | undefined,
    nForHint: number | null
  ): Promise<string> {
    try {
      const result = await deps.resume(item.sid, item.agent, model)
      const opened = `✅ 已在电脑上打开「${truncate(item.title, 40)}」${model ? `（模型 ${model}）` : ''}\n目录：${result.workspace}`
      if (!text) {
        const hint = nForHint ? `/继续 ${nForHint} <第一句话>` : '/继续 <序号> <第一句话>'
        return `${opened}\n回到电脑就能接着聊。想让它直接开工：${hint}。`
      }

      // 带话模式：恢复后轮询等终端就绪（CLI 起来要几秒），然后把话递进去。
      if (!result.sessionId && !result.terminalId) {
        console.log(
          '[feishu-router] resume 没拿到句柄 sid=%s terminalId=%s',
          result.sessionId,
          result.terminalId
        )
        return `${opened}\n⚠️ 没拿到新会话的句柄，投喂不了——稍后在电脑上直接说。`
      }
      console.log(
        '[feishu-router] resume ok，开始等就绪 terminalId=%s sessionId=%s',
        result.terminalId,
        result.sessionId
      )
      const deadline = Date.now() + pollTimeoutMs
      while (Date.now() < deadline) {
        await sleep(pollIntervalMs)
        try {
          const active = await deps.listActive()
          const match = active.find((s) =>
            result.sessionId
              ? s.sessionId === result.sessionId
              : s.terminalId === result.terminalId
          )
          if (match) {
            console.log(
              '[feishu-router] 轮询命中 status=%s ready=%s sessionId=%s',
              match.status,
              match.ready,
              match.sessionId
            )
          } else {
            console.log(
              '[feishu-router] 轮询未命中（活动会话 %d 个，找 terminalId=%s sessionId=%s）',
              active.length,
              result.terminalId,
              result.sessionId
            )
          }
          if (
            match &&
            (match.status === 'idle' || match.status === 'done') &&
            match.ready !== false
          ) {
            await deps.send(match.sessionId, text, item.agent || undefined)
            console.log('[feishu-router] 投喂成功 sessionId=%s', match.sessionId)
            return `${opened}\n📨 已投喂：「${truncate(text, 40)}」——它开跑了。`
          }
        } catch (error) {
          console.log(
            '[feishu-router] 轮询出错（继续等）：%s',
            error instanceof Error ? error.message : String(error)
          )
        }
      }
      console.log('[feishu-router] 投喂超时，放弃自动投喂')
      return `${opened}\n⚠️ 等了太久 CLI 还没就绪，话没递进去。稍后 /会话 看状态，就绪后用 /发 投喂。`
    } catch (error) {
      return `❌ 没开成：${messageOf(error)}`
    }
  }

  async function doResume(
    openId: string,
    n: number,
    model?: string,
    text?: string,
    messageId: string | null = null,
    computerName?: string
  ): Promise<string> {
    if (computerName) {
      const named = await resolveNamed(computerName)
      if (named.kind === 'error') return named.message
      if (named.kind === 'remote') {
        const known = slotByNumber((await historyItems(openId)) ?? [], n, computerName)
        return handoff(messageId, openId, 'resume', named.computer, {
          n,
          ...(known ? { sid: known.sid, agent: known.agent, title: known.title } : {}),
          ...(model ? { model } : {}),
          ...(text ? { text } : {})
        })
      }
    }
    const items = await historyItems(openId)
    if (!items || items.length === 0) return '先用 /列表 拉一次会话列表（序号 30 分钟内有效）。'
    const item = slotByNumber(items, n) ?? items[n - 1]
    if (!item) return `序号超出范围，现在是 1-${items.length}。`
    if (item.computerId && deps.fleet && item.computerId !== deps.fleet.self().id) {
      const handed = await handoffById(
        messageId,
        openId,
        'resume',
        item.computerId,
        item.computerName || item.computerId,
        {
          n,
          sid: item.sid,
          agent: item.agent,
          title: item.title,
          ...(model ? { model } : {}),
          ...(text ? { text } : {})
        }
      )
      if (handed.ok || handed.text) return handed.text
    }
    return openAndMaybeFeed(item, model, text, n)
  }

  async function openDshSessionText(): Promise<string> {
    if (!deps.openDshSession) {
      return '这台电脑还没接上 DSH 打开器。'
    }
    try {
      const result = await deps.openDshSession()
      if (!result.ok) return `❌ ${result.message}`
      return `✅ ${result.message}\n这场不经过终端，只交给电脑上的 DSH 界面。`
    } catch (error) {
      return `❌ 没开成：${messageOf(error)}`
    }
  }

  async function openLatestWorkbuddyText(): Promise<string> {
    if (!deps.openLatestWorkbuddy) {
      return '这台电脑还没接上国内 WorkBuddy 的打开器。'
    }
    try {
      const result = await deps.openLatestWorkbuddy()
      if (!result.ok) return `❌ ${result.message}`
      return `✅ ${result.message}\n这场不经过终端，也不会自动发消息。`
    } catch (error) {
      return `❌ 没开成：${messageOf(error)}`
    }
  }

  async function doSend(
    openId: string,
    n: number,
    text: string,
    messageId: string | null = null,
    computerName?: string
  ): Promise<string> {
    if (computerName) {
      const named = await resolveNamed(computerName)
      if (named.kind === 'error') return named.message
      if (named.kind === 'remote') {
        const known = slotByNumber((await activeItems(openId)) ?? [], n, computerName)
        return handoff(messageId, openId, 'send', named.computer, {
          n,
          text,
          ...(known ? { sid: known.sid, agent: known.agent, title: known.title } : {})
        })
      }
    }
    let items = await activeItems(openId)
    if (!items) {
      // 没拉过 /会话：能自动解析就别折腾人 —— 只有一场开着就直接用它。
      const active = await deps.listActive()
      if (active.length === 0) {
        return '电脑上现在没有开着的会话。要续旧的发 /列表，要新开就回电脑。'
      }
      if (active.length > 1) {
        await sendActiveList(openId)
        return `现在开着 ${active.length} 场，看上面序号：/发 <序号> <一句话>。`
      }
      items = [
        {
          sid: active[0]!.sessionId,
          agent: active[0]!.adapterId ?? active[0]!.agent ?? '',
          title: active[0]!.name
        }
      ]
      cachePut(activeCache, openId, items)
    }
    const item = slotByNumber(items, n) ?? items[n - 1]
    if (!item) return `序号超出范围，现在是 1-${items.length}。`
    if (item.computerId && deps.fleet && item.computerId !== deps.fleet.self().id) {
      const handed = await handoffById(
        messageId,
        openId,
        'send',
        item.computerId,
        item.computerName || item.computerId,
        { n, text, sid: item.sid, agent: item.agent, title: item.title }
      )
      if (handed.ok || handed.text) return handed.text
    }
    try {
      const result = await deps.send(item.sid, text, item.agent || undefined)
      return `✅ 已投喂「${truncate(item.title, 40)}」${result.mode === 'control' ? '（受控通道）' : '（终端打字）'}`
    } catch (error) {
      return `❌ 没发出去：${messageOf(error)}`
    }
  }

  /**
   * 按钮上带了别的电脑 id 时，只写命令并立刻回 toast。
   * 卡片回调大约 3 秒就重投，不能在这里等那台电脑把会话打开。
   * 本机按钮返回 null，交给原来的本地路径。
   */
  async function cardRemote(action: FeishuInboundCardAction): Promise<unknown | null> {
    const computerId = stringField(action.value['computerId'])
    if (!computerId || !deps.fleet) return null
    let selfId = ''
    try {
      selfId = deps.fleet.self().id
    } catch {
      return null
    }
    if (computerId === selfId) return null
    const cmd = stringField(action.value['cmd'])
    if (cmd !== 'resume' && cmd !== 'open-workbuddy' && cmd !== 'open-dsh' && cmd !== 'list') {
      return null
    }
    const computerName = stringField(action.value['computerName']) || computerId
    const payload: Record<string, unknown> = {}
    if (cmd === 'resume') {
      payload['sid'] = stringField(action.value['sid'])
      payload['agent'] = stringField(action.value['agent'])
      payload['title'] = stringField(action.value['title'])
      const model = stringField(action.value['model'])
      if (model) payload['model'] = model
    }
    const handed = await handoffById(
      action.messageId,
      action.openId,
      cmd,
      computerId,
      computerName,
      payload
    )
    return {
      toast: {
        type: handed.ok ? 'info' : 'error',
        content: truncate(handed.text || '已交给那台电脑', 60)
      }
    }
  }

  async function executeLocal(command: FleetLocalCommand): Promise<void> {
    const openId = command.openId
    const payload = command.payload ?? {}
    try {
      if (command.action === 'list') {
        await sendLocalList(openId)
        return
      }
      if (command.action === 'active') {
        await sendActiveList(openId)
        return
      }
      if (command.action === 'open-workbuddy') {
        await sendText(openId, await openLatestWorkbuddyText())
        return
      }
      if (command.action === 'open-dsh') {
        await sendText(openId, await openDshSessionText())
        return
      }
      if (command.action === 'resume') {
        await sendText(openId, await resumeFromPayload(payload))
        return
      }
      if (command.action === 'send') {
        await sendText(openId, await sendFromPayload(openId, payload))
        return
      }
      await sendText(openId, `不认识交给这台电脑的动作：${command.action}`)
    } catch (error) {
      try {
        await sendText(openId, `这台电脑没做成：${messageOf(error)}`)
      } catch {
        // 回话也发不出去就停在这里。命令行会记失败。
      }
    }
  }

  async function resumeFromPayload(payload: Record<string, unknown>): Promise<string> {
    const model = stringField(payload['model']) || undefined
    const text = stringField(payload['text']) || undefined
    const sid = stringField(payload['sid'])
    const nRaw = payload['n']
    const n = typeof nRaw === 'number' ? nRaw : Number(nRaw)
    const nForHint = Number.isFinite(n) && n >= 1 ? n : null
    if (sid) {
      const sessions = await deps.history()
      const found = sessions.find((session) => session.sessionId === sid)
      return openAndMaybeFeed(
        {
          sid,
          agent: found?.agent || stringField(payload['agent']),
          title: found?.title || stringField(payload['title']) || sid
        },
        model,
        text,
        nForHint
      )
    }
    if (!nForHint) return '没带上序号，这台电脑不知道开哪一场。'
    const resumable = (await deps.history()).filter((session) => session.resumable)
    const session = resumable[nForHint - 1]
    if (!session) return `这台电脑上序号超出范围，现在是 1-${resumable.length}。`
    return openAndMaybeFeed(
      { sid: session.sessionId, agent: session.agent, title: session.title },
      model,
      text,
      nForHint
    )
  }

  async function sendFromPayload(_openId: string, payload: Record<string, unknown>): Promise<string> {
    const text = stringField(payload['text'])
    if (!text) return '没带上要发的话。'
    const sid = stringField(payload['sid'])
    if (sid) {
      const sessions = await deps.history()
      const found = sessions.find((session) => session.sessionId === sid)
      const agent = found?.agent || stringField(payload['agent']) || undefined
      const title = found?.title || stringField(payload['title']) || sid
      try {
        const result = await deps.send(sid, text, agent)
        return `✅ 已投喂「${truncate(title, 40)}」${result.mode === 'control' ? '（受控通道）' : '（终端打字）'}`
      } catch (error) {
        return `❌ 没发出去：${messageOf(error)}`
      }
    }
    const nRaw = payload['n']
    const n = typeof nRaw === 'number' ? nRaw : Number(nRaw)
    if (!Number.isFinite(n) || n < 1) return '没带上序号，这台电脑不知道往哪一场发。'
    const active = await deps.listActive()
    const session = active[n - 1]
    if (!session) return `这台电脑上序号超出范围，现在是 1-${active.length}。`
    try {
      const result = await deps.send(session.sessionId, text, session.adapterId ?? session.agent ?? undefined)
      return `✅ 已投喂「${truncate(session.name, 40)}」${result.mode === 'control' ? '（受控通道）' : '（终端打字）'}`
    } catch (error) {
      return `❌ 没发出去：${messageOf(error)}`
    }
  }

  async function taskQuestionsText(): Promise<string> {
    if (!deps.listTaskQuestions) return '这台电脑还不能列出任务问题。'
    const rows = await deps.listTaskQuestions()
    if (rows.length === 0) return '现在没有等你回答的问题。'
    return rows
      .slice(0, 8)
      .map((row) => `${row.id}\n${truncate(row.prompt, 80)}`)
      .join('\n\n')
  }

  async function answerTaskQuestionText(
    questionId: string,
    answer: string
  ): Promise<string> {
    if (!deps.answerTaskQuestion) return '这台电脑还不能按问题编号作答。'
    const result = await deps.answerTaskQuestion(questionId, answer)
    if (!result) return '这场会话已经不在，或者答案不在选项里。'
    if (result.alreadyAnswered) return '这题已经答过，第一次的答案还在。'
    return result.delivered ? '已记下，并送回这场会话。' : '已记下。送回会话时失败了。'
  }

  return {
    async onMessage(message: FeishuInboundMessage): Promise<void> {
      try {
        // 安全边界：非单聊、非配对人，一概沉默。群聊里回话等于广播终端。
        if (message.chatType !== 'p2p') return
        if (!deps.isPaired(message.openId)) return
        if (message.messageType !== 'text') {
          await sendText(message.openId, '目前只认文字指令。发 /帮助 看用法。')
          return
        }

        const command = parseCommand(message.text)
        switch (command.cmd) {
          case 'help':
            await deps.sendTo(message.openId, { card: helpCard() })
            return
          case 'computers':
            await sendComputers(message.openId)
            return
          case 'list':
            await sendList(message.openId, message.messageId, command.computer)
            return
          case 'active':
            await sendActiveList(message.openId, message.messageId, command.computer)
            return
          case 'questions':
            await sendText(message.openId, await taskQuestionsText())
            return
          case 'answer':
            await sendText(
              message.openId,
              await answerTaskQuestionText(command.questionId, command.answer)
            )
            return
          case 'open-workbuddy':
            await sendText(
              message.openId,
              await runNamed(
                message.messageId,
                message.openId,
                command.computer,
                'open-workbuddy',
                {},
                () => openLatestWorkbuddyText(),
                true
              )
            )
            return
          case 'open-dsh':
            await sendText(
              message.openId,
              await runNamed(
                message.messageId,
                message.openId,
                command.computer,
                'open-dsh',
                {},
                () => openDshSessionText(),
                true
              )
            )
            return
          case 'resume':
            await sendText(
              message.openId,
              await doResume(
                message.openId,
                command.n,
                undefined,
                command.text,
                message.messageId,
                command.computer
              )
            )
            return
          case 'send':
            await sendText(
              message.openId,
              await doSend(
                message.openId,
                command.n,
                command.text,
                message.messageId,
                command.computer
              )
            )
            return
          default:
            await sendText(
              message.openId,
              '不认识这个指令。发 /帮助 看可用命令。'
            )
        }
      } catch (error) {
        // 兜底：入站回调绝不抛错，但要让人知道出了事。
        try {
          await sendText(message.openId, `处理失败：${messageOf(error)}`)
        } catch {
          // 连回话都发不出去（比如掉线）—— 只能到此为止。
        }
      }
    },

    async onCardAction(action: FeishuInboundCardAction): Promise<unknown> {
      if (!deps.isPaired(action.openId)) return undefined
      const value = action.value ?? {}
      try {
        const remoteToast = await cardRemote(action)
        if (remoteToast) return remoteToast
        // 第一步按钮：选会话 → 回模型选择卡。模型清单跟 CLI 走，不跟电脑走。
        if (value['cmd'] === 'pick' && typeof value['sid'] === 'string') {
          const sid = value['sid']
          const agent = typeof value['agent'] === 'string' ? value['agent'] : undefined
          const title = typeof value['title'] === 'string' ? value['title'] : '会话'
          const computerId = stringField(value['computerId'])
          const computerName = stringField(value['computerName'])
          const models = agent ? deps.getModels(agent) : []
          await deps.sendTo(action.openId, {
            card: modelPickerCard({
              sid,
              agent: agent ?? '',
              title,
              models,
              ...(computerId ? { computerId, computerName } : {})
            })
          })
          return { toast: { type: 'success', content: '选个模型' } }
        }
        // 第二步按钮：选模型 → 真正 resume。别的电脑的按钮已经在 cardRemote 里交出去了。
        if (value['cmd'] === 'resume' && typeof value['sid'] === 'string') {
          const title = typeof value['title'] === 'string' ? value['title'] : '会话'
          const agent = typeof value['agent'] === 'string' ? value['agent'] : undefined
          const model = typeof value['model'] === 'string' ? value['model'] : undefined
          await deps.resume(value['sid'], agent, model)
          await sendText(
            action.openId,
            `✅ 已在电脑上打开「${truncate(title, 40)}」${model ? `（模型 ${model}）` : ''}，回去就能接着聊。`
          )
          return { toast: { type: 'success', content: '已在电脑上打开' } }
        }
        if (value['cmd'] === 'open-workbuddy') {
          if (!deps.openLatestWorkbuddy) {
            await sendText(action.openId, '这台电脑还没接上国内 WorkBuddy 的打开器。')
            return { toast: { type: 'error', content: '没有 WorkBuddy 打开器' } }
          }
          const result = await deps.openLatestWorkbuddy()
          await sendText(
            action.openId,
            result.ok
              ? `✅ ${result.message}\n这场不经过终端，也不会自动发消息。`
              : `❌ ${result.message}`
          )
          return {
            toast: {
              type: result.ok ? 'success' : 'error',
              content: result.ok ? '已在 WorkBuddy 里打开' : truncate(result.message, 60)
            }
          }
        }
        if (value['cmd'] === 'open-dsh') {
          if (!deps.openDshSession) {
            await sendText(action.openId, '这台电脑还没接上 DSH 打开器。')
            return { toast: { type: 'error', content: '没有 DSH 打开器' } }
          }
          const result = await deps.openDshSession()
          await sendText(
            action.openId,
            result.ok
              ? `✅ ${result.message}\n这场不经过终端，只交给电脑上的 DSH 界面。`
              : `❌ ${result.message}`
          )
          return {
            toast: {
              type: result.ok ? 'success' : 'error',
              content: result.ok ? '已在 DSH 里打开' : truncate(result.message, 60)
            }
          }
        }
        if (value['cmd'] === 'list') {
          await sendList(action.openId)
          return { toast: { type: 'success', content: '已发最新列表' } }
        }
        if (value['cmd'] === 'help') {
          await deps.sendTo(action.openId, { card: helpCard() })
          return { toast: { type: 'success', content: '已发用法' } }
        }
      } catch (error) {
        return { toast: { type: 'error', content: truncate(messageOf(error), 60) } }
      }
      return undefined
    },

    executeLocal
  }
}
