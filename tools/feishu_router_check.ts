/**
 * 飞书入站路由的离线判卷：/帮助 /列表 /继续 /会话 /发 + 卡片按钮 + 准入。
 *
 * 不碰网络、不碰 Electron。重点盯：
 *   1. 安全：非配对人、非单聊一律沉默（sendTo 一次都不能被调）；
 *   2. 序号靠缓存：没拉过列表就 /继续，必须提示而不是瞎开；
 *   3. 错误折成给用户的人话，路由本体绝不抛错；
 *   4. 卡片按钮的 value 形状和消息指令走同一条操作路径。
 *
 * 跑法：
 *   node_modules/.bin/esbuild tools/feishu_router_check.ts --bundle \
 *     --platform=node --format=esm --outfile=tools/_feishu_router_check.mjs \
 *     && node tools/_feishu_router_check.mjs
 */

import type { BridgeHistorySession, BridgeResumeResult, BridgeSessionInfo } from '../shared/bridge-protocol'
import type { FeishuInboundCardAction, FeishuInboundMessage } from '../electron/feishu/channel'
import { parseCommand, createFeishuRouter, type FeishuFleetPort } from '../electron/feishu/router'
import { planResume } from '../shared/session-resume'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, extra = ''): void {
  if (ok) {
    pass += 1
    console.log(`  \u2714 ${name}`)
  } else {
    fail += 1
    console.log(`  \u2716 ${name}${extra ? ` \u2014 ${extra}` : ''}`)
  }
}

// ------------------------------------------------------------------ 解析

{
  check('/帮助', parseCommand('/帮助').cmd === 'help')
  check('/help', parseCommand('/help').cmd === 'help')
  check('/列表', parseCommand('/列表').cmd === 'list')
  check('/会话', parseCommand('/会话').cmd === 'active')
  check('/继续 3', (() => { const c = parseCommand('/继续 3'); return c.cmd === 'resume' && c.n === 3 && !c.text && !c.computer })())
  check('/继续 办公室 3', (() => {
    const c = parseCommand('/继续 办公室 3')
    return c.cmd === 'resume' && c.n === 3 && c.computer === '办公室' && !c.text
  })())
  check('/电脑', parseCommand('/电脑').cmd === 'computers')
  check('/列表 办公室', (() => {
    const c = parseCommand('/列表 办公室')
    return c.cmd === 'list' && c.computer === '办公室'
  })())
  check(
    '/继续 1 继续干活 → resume 带话',
    (() => {
      const c = parseCommand('/继续 1 继续干活')
      return c.cmd === 'resume' && c.n === 1 && c.text === '继续干活'
    })()
  )
  check('/发 2 你好 世界', (() => {
    const c = parseCommand('/发 2 你好 世界')
    return c.cmd === 'send' && c.n === 2 && c.text === '你好 世界'
  })())
  check('前导空格容忍', parseCommand('  /列表  ').cmd === 'list')
  check('/继续 没序号 → unknown', parseCommand('/继续').cmd === 'unknown')
  check('/发 2 没正文 → unknown', parseCommand('/发 2').cmd === 'unknown')
  check('不是斜杠开头 → unknown', parseCommand('你好').cmd === 'unknown')
  check('/瞎写 → unknown', parseCommand('/瞎写').cmd === 'unknown')
  check('/继续 0 → unknown', parseCommand('/继续 0').cmd === 'unknown')
  check('/打开', parseCommand('/打开').cmd === 'open-workbuddy')
  check('/open', parseCommand('/open').cmd === 'open-workbuddy')
  check('/打开 不带序号也认', parseCommand('/打开 1').cmd === 'open-workbuddy')
  check('/dsh', parseCommand('/dsh').cmd === 'open-dsh')
  check('/DSH 大小写不敏感', parseCommand('/DSH').cmd === 'open-dsh')
  check('/dsh 带尾巴仍是 open-dsh（取最近一场）', parseCommand('/dsh ses-9').cmd === 'open-dsh')
  check('/dshx → unknown（不是前缀匹配）', parseCommand('/dshx').cmd === 'unknown')
}

// ------------------------------------------------------------------ 假件

function makeSession(overrides: Partial<BridgeHistorySession> = {}): BridgeHistorySession {
  return {
    agent: 'grok',
    sessionId: 'ses-1',
    title: '造书成剧 · 首页改版',
    workspace: 'D:/wx/造书成剧',
    updatedAt: '2026-10-01T08:00:00.000Z',
    messageCount: 42,
    resumable: true,
    ...overrides
  }
}

const resumeResult: BridgeResumeResult = {
  historySessionId: 'ses-1',
  agent: 'grok',
  workspace: 'D:/wx/造书成剧',
  installationId: 'inst-1',
  args: ['--resume', 'ses-1'],
  dryRun: false,
  terminalId: 'term-1',
  sessionId: 'live-1'
}

interface Deps {
  historyImpl?: () => Promise<BridgeHistorySession[]>
  listActiveImpl?: () => Promise<BridgeSessionInfo[]>
  resumeImpl?: (sessionId: string, agent?: string) => Promise<BridgeResumeResult>
  sendImpl?: (sessionId: string, text: string, agent?: string) => Promise<{ accepted: true; mode: string }>
  paired?: string[]
  /** 带话恢复的轮询参数（判卷用小值）。 */
  pollIntervalMs?: number
  pollTimeoutMs?: number
  /** 第 N 次 listActive 之后终端才算就绪（模拟 CLI 启动耗时）。 */
  listReadyAfterCalls?: number
  /** 接上之后 /打开 和列表按钮才会去开国内 WorkBuddy。 */
  openLatestWorkbuddyImpl?: () => Promise<{ ok: boolean; message: string }>
  /**
   * 接上之后 /dsh 和列表按钮才会去开 DSH 界面。
   * 入参是飞书侧传下来的 sessionId（省略 = 最近一场），判卷要验它被原样透传。
   */
  openDshSessionImpl?: (sessionId?: string) => Promise<{ ok: boolean; message: string }>
  fleet?: FeishuFleetPort
}

function makeFixture(deps: Deps = {}) {
  const sent: Array<{ openId: string; message: Record<string, unknown> }> = []
  const calls = { history: 0, listActive: 0, resume: 0, send: 0, openWorkbuddy: 0, openDsh: 0 }
  const resumeArgs: Array<{ sid: string; agent?: string; model?: string }> = []
  const dshArgs: Array<string | undefined> = []
  const router = createFeishuRouter({
    history: async () => {
      calls.history += 1
      return deps.historyImpl
        ? deps.historyImpl()
        : Promise.resolve([
            makeSession({ sessionId: 'ses-1' }),
            makeSession({ sessionId: 'ses-2', agent: 'codex', title: 'asc 排查' })
          ])
    },
    listActive: async () => {
      calls.listActive += 1
      if (deps.listActiveImpl) return deps.listActiveImpl()
      return Promise.resolve([
        {
          sessionId: 'live-1',
          terminalId: 't1',
          name: '造书成剧 · 首页改版',
          status: 'idle',
          workspace: 'D:/wx/造书成剧',
          installationId: 'inst-1',
          runtime: 'pty',
          pendingAttentionCount: 0,
          adapterId: 'grok',
          // 模拟 CLI 启动：第 N 次轮询之后终端才画出界面（ready）。
          ready: calls.listActive > (deps.listReadyAfterCalls ?? 0)
        } as BridgeSessionInfo
      ])
    },
    resume: async (sessionId, agent, model) => {
      calls.resume += 1
      resumeArgs.push({ sid: sessionId, agent, model })
      if (deps.resumeImpl) return deps.resumeImpl(sessionId, agent)
      return { ...resumeResult, historySessionId: sessionId }
    },
    getModels: (agent: string) => (agent === 'grok' ? ['grok-4.7', 'x-460b'] : []),
    send: async (sessionId, text, agent) => {
      calls.send += 1
      if (deps.sendImpl) return deps.sendImpl(sessionId, text, agent)
      void agent
      return { accepted: true, mode: 'control' }
    },
    sendTo: async (openId, message) => {
      sent.push({ openId, message: message as Record<string, unknown> })
    },
    isPaired: (openId) => (deps.paired ?? ['ou_me']).includes(openId),
    pollIntervalMs: deps.pollIntervalMs,
    pollTimeoutMs: deps.pollTimeoutMs,
    ...(deps.openLatestWorkbuddyImpl
      ? {
          openLatestWorkbuddy: async () => {
            calls.openWorkbuddy += 1
            return deps.openLatestWorkbuddyImpl!()
          }
        }
      : {}),
    ...(deps.openDshSessionImpl
      ? {
          openDshSession: async (sessionId?: string) => {
            calls.openDsh += 1
            dshArgs.push(sessionId)
            return deps.openDshSessionImpl!(sessionId)
          }
        }
      : {}),
    ...(deps.fleet ? { fleet: deps.fleet } : {})
  })

  const message = (overrides: Partial<FeishuInboundMessage> = {}): FeishuInboundMessage => ({
    openId: 'ou_me',
    chatId: 'oc_chat',
    messageId: 'om_1',
    chatType: 'p2p',
    messageType: 'text',
    text: '/帮助',
    receivedAt: Date.now(),
    ...overrides
  })
  const cardAction = (value: Record<string, unknown>): FeishuInboundCardAction => ({
    openId: 'ou_me',
    chatId: 'oc_chat',
    messageId: 'om_1',
    actionTag: 'button',
    value,
    receivedAt: Date.now()
  })
  const lastText = (): string => {
    const last = sent[sent.length - 1]
    const message = last?.message as { text?: string }
    return message?.text ?? ''
  }
  const lastCard = (): Record<string, unknown> => {
    const last = sent[sent.length - 1]
    return (last?.message as { card?: Record<string, unknown> }).card ?? {}
  }
  return { router, sent, calls, resumeArgs, dshArgs, message, cardAction, lastText, lastCard }
}

// ------------------------------------------------------------------ 安全

{
  const { router, sent, message } = makeFixture({ paired: ['ou_other'] })
  await router.onMessage(message({ text: '/帮助' }))
  check('非配对人：一条消息都不回', sent.length === 0, String(sent.length))
  await router.onMessage(message({ openId: 'ou_me', chatType: 'group', text: '/帮助' }))
  check('群聊：不回', sent.length === 0, String(sent.length))
  const toast = await router.onCardAction(makeCardActionFor({ cmd: 'resume', sid: 'x' }, 'ou_stranger'))
  check('非配对人点按钮：无响应', toast === undefined)
}

function makeCardActionFor(value: Record<string, unknown>, openId = 'ou_me'): FeishuInboundCardAction {
  return {
    openId,
    chatId: 'oc',
    messageId: 'om',
    actionTag: 'button',
    value,
    receivedAt: Date.now()
  }
}

// ------------------------------------------------------------------ 基本流

{
  const { router, sent, message, lastCard, lastText } = makeFixture()

  await router.onMessage(message({ text: '/帮助' }))
  const card = lastCard()
  const header = (card as { header?: { title?: { content?: string } } }).header
  check('/帮助 回的是卡片', Boolean(header?.title?.content))
  check('/帮助 卡里写了 /列表', JSON.stringify(card).includes('/列表'))
  check('/帮助 卡里写了 /打开', JSON.stringify(card).includes('/打开'))
  check('/帮助 卡里写了 /dsh', JSON.stringify(card).includes('/dsh'))
  check('/帮助 卡里说明了 dsh 不进序号', JSON.stringify(card).includes('不进'))

  await router.onMessage(message({ text: '/列表' }))
  const listCard = lastCard() as {
    header?: { title?: { content?: string } }
    elements?: Array<{ tag?: string; actions?: Array<{ value?: Record<string, unknown> }> }>
  }
  check('/列表 卡片头带数量', listCard.header?.title?.content?.includes('2') === true)
  const buttons = listCard.elements?.flatMap((el) => el.actions ?? []) ?? []
  const pickButtons = buttons.filter((button) => button.value?.['cmd'] === 'pick')
  check('/列表 有两个序号按钮', pickButtons.length === 2, String(pickButtons.length))
  check(
    '按钮 value 带 sid+agent+title',
    pickButtons[0]?.value?.['sid'] === 'ses-1' &&
      pickButtons[0]?.value?.['agent'] === 'grok' &&
      typeof pickButtons[0]?.value?.['title'] === 'string'
  )
  check('没接打开器时列表不放 WorkBuddy 按钮', !buttons.some((button) => button.value?.['cmd'] === 'open-workbuddy'))
  check('没接打开器时列表不放 DSH 按钮', !buttons.some((button) => button.value?.['cmd'] === 'open-dsh'))

  await router.onMessage(message({ text: '/继续 2' }))
  check('/继续 2 回复带 ✅', lastText().includes('✅'), lastText())
  check('/继续 2 回复带目录', lastText().includes('D:/wx/造书成剧'))

  await router.onMessage(message({ text: '/会话' }))
  const activeText = lastText()
  check('/会话 列出开着的会话', activeText.includes('造书成剧'), activeText)
  check('/会话 状态翻成人话', activeText.includes('空闲'))

  await router.onMessage(message({ text: '/发 1 帮我把首页按钮改大一点' }))
  check('/发 回复 ✅', lastText().includes('✅'), lastText())
}

// ------------------------------------------------------------------ 序号与缓存

{
  const { router, message, lastText } = makeFixture()
  await router.onMessage(message({ text: '/继续 1' }))
  check('没拉过列表就 /继续：提示先 /列表', lastText().includes('/列表'), lastText())

  await router.onMessage(message({ text: '/会话' }))
  await router.onMessage(message({ text: '/发 1 你好' }))
  check('先 /会话 再 /发：通', lastText().includes('✅'))

  await router.onMessage(message({ text: '/列表' }))
  await router.onMessage(message({ text: '/继续 99' }))
  check('序号越界：范围提示', lastText().includes('1-2'), lastText())
}

// ------------------------------------------------------------------ 错误折人话

{
  const { router, message, lastText } = makeFixture({
    resumeImpl: async () => {
      throw new Error('原目录不可用（D:/gone）：目录不存在')
    },
    sendImpl: async () => {
      throw new Error('Cannot send while session is working')
    }
  })
  await router.onMessage(message({ text: '/列表' }))
  await router.onMessage(message({ text: '/继续 1' }))
  check('resume 失败：❌ + 原因', lastText().includes('❌') && lastText().includes('原目录不可用'), lastText())

  await router.onMessage(message({ text: '/会话' }))
  await router.onMessage(message({ text: '/发 1 hi' }))
  check('send 失败（正忙）：❌ + 原因', lastText().includes('❌') && lastText().includes('working'), lastText())
}

// ------------------------------------------------------------------ 卡片按钮

{
  const { router, calls, sent, cardAction, lastText } = makeFixture()
  const toast = await router.onCardAction(
    cardAction({ cmd: 'resume', sid: 'ses-9', agent: 'grok', title: '测试会话' })
  )
  check('按钮恢复：resume 被调', calls.resume === 1, String(calls.resume))
  check(
    '按钮恢复：toast success',
    (toast as { toast?: { type?: string } })?.toast?.type === 'success'
  )
  check('按钮恢复：私聊也收到 ✅', lastText().includes('✅'))

  await router.onCardAction(cardAction({ cmd: 'list' }))
  check('按钮 list：发出列表卡', sent.some((item) => 'card' in item.message))

  const boom = makeFixture({
    resumeImpl: async () => {
      throw new Error('mock resume failure')
    }
  })
  const errToast = (await boom.router.onCardAction(
    boom.cardAction({ cmd: 'resume', sid: 'boom' })
  )) as { toast?: { type?: string; content?: string } }
  check(
    '按钮恢复失败：toast error 带原因',
    errToast?.toast?.type === 'error' &&
      errToast.toast.content?.includes('mock resume failure') === true,
    JSON.stringify(errToast)
  )

  const unknown = await router.onCardAction(cardAction({ cmd: 'mystery' }))
  check('未知按钮：不炸不回话', unknown === undefined)
}

// ------------------------------------------------------------------ 选模型两步流

{
  const { router, calls, resumeArgs, sent, cardAction, lastCard } = makeFixture()

  // 第一步：点列表里的序号 → 回模型选择卡
  const pickToast = await router.onCardAction(
    cardAction({ cmd: 'pick', sid: 'ses-1', agent: 'grok', title: '造书成剧' })
  ) as { toast?: { type?: string } }
  check('pick：不直接 resume', calls.resume === 0, String(calls.resume))
  check('pick：toast success', pickToast?.toast?.type === 'success')
  const picker = lastCard() as {
    header?: { title?: { content?: string } }
    elements?: Array<{ tag?: string; actions?: Array<{ value?: Record<string, unknown> }> }>
  }
  check('pick：卡片头是「选择模型」', picker.header?.title?.content?.includes('选择模型') === true)
  const pickerButtons =
    picker.elements?.flatMap((el) => el.actions ?? []) ?? []
  const models = pickerButtons
    .map((b) => b.value?.['model'])
    .filter((m): m is string => typeof m === 'string')
  check(
    'pick：模型来自 getModels（默认 + grok 清单）',
    models.length === 2 && models[0] === 'grok-4.7' && models[1] === 'x-460b',
    JSON.stringify(models)
  )

  // 第二步：点具体模型 → resume 带上 model
  await router.onCardAction(
    cardAction({ cmd: 'resume', sid: 'ses-1', agent: 'grok', title: '造书成剧', model: 'grok-4.7' })
  )
  check('选模型恢复：resume 收到 model', resumeArgs[0]?.model === 'grok-4.7')

  // claude 没配清单：只有「默认」，resume 不带 model
  const claudePick = makeFixture()
  await claudePick.router.onCardAction(
    claudePick.cardAction({ cmd: 'pick', sid: 'ses-3', agent: 'claude', title: 'x' })
  )
  const claudeCard = claudePick.lastCard() as {
    elements?: Array<{ tag?: string; actions?: Array<{ value?: Record<string, unknown> }> }>
  }
  const claudeButtons = claudeCard.elements?.flatMap((el) => el.actions ?? []) ?? []
  check(
    'claude：只有默认按钮',
    claudeButtons.length === 1 && claudeButtons[0]?.value?.['model'] === undefined,
    String(claudeButtons.length)
  )

  // planResume 拼参：模型追加 --model
  const plan = planResume(
    { ...makeSession(), id: 'ses-1' } as never,
    'sonnet'
  )
  check('planResume 带 model：args 追加 --model', JSON.stringify(plan).includes('sonnet'))
  const planNoModel = planResume({ ...makeSession(), id: 'ses-1' } as never)
  check('planResume 无 model：args 原样', !JSON.stringify(planNoModel).includes('--model'))
}

// ------------------------------------------------------------------ 带话恢复（/继续 n <第一句话>）

{
  const { router, calls, message, lastText } = makeFixture({
    pollIntervalMs: 10,
    pollTimeoutMs: 500,
    listReadyAfterCalls: 1 // 第一次轮询还没就绪，第二次起可以投喂
  })
  await router.onMessage(message({ text: '/列表' }))
  await router.onMessage(message({ text: '/继续 1 继续干活' }))
  check('带话恢复：CLI 就绪后自动投喂', lastText().includes('📨'), lastText())
  check('带话恢复：send 真的被调了', calls.send === 1, String(calls.send))
  check('带话恢复：投喂的就是那句话', lastText().includes('继续干活'), lastText())
}

{
  const { router, calls, message, lastText } = makeFixture({
    pollIntervalMs: 10,
    pollTimeoutMs: 150,
    listReadyAfterCalls: 9999 // 永远不就绪
  })
  await router.onMessage(message({ text: '/列表' }))
  await router.onMessage(message({ text: '/继续 1 开跑' }))
  check('CLI 一直没就绪：超时提示 ⚠️', lastText().includes('⚠️'), lastText())
  check('CLI 一直没就绪：绝不瞎投喂', calls.send === 0, String(calls.send))
}

// ------------------------------------------------------------------ /发 免拉取

{
  const { router, calls, message, lastText } = makeFixture()
  await router.onMessage(message({ text: '/发 1 你好' }))
  check('/发 免拉取：只有一场开着直接投喂', lastText().includes('✅') && calls.send === 1, lastText())
}
{
  const twoSessions = async (): Promise<BridgeSessionInfo[]> => [
    {
      sessionId: 'live-1',
      terminalId: 't1',
      name: '甲',
      status: 'idle',
      workspace: 'D:/a',
      installationId: 'inst-1',
      runtime: 'pty',
      pendingAttentionCount: 0,
      adapterId: 'grok'
    },
    {
      sessionId: 'live-2',
      terminalId: 't2',
      name: '乙',
      status: 'idle',
      workspace: 'D:/b',
      installationId: 'inst-1',
      runtime: 'pty',
      pendingAttentionCount: 0,
      adapterId: 'codex'
    }
  ]
  const { router, message, lastText } = makeFixture({ listActiveImpl: twoSessions })
  await router.onMessage(message({ text: '/发 1 你好' }))
  check('/发 多场：列出让人挑', lastText().includes('2 场'), lastText())
  await router.onMessage(message({ text: '/发 2 给乙的话' }))
  check('/发 多场：第二次按序号投喂', lastText().includes('乙'), lastText())
}

// ------------------------------------------------------------------ 路由本体绝不抛

{
  const { router, message, lastText } = makeFixture({
    historyImpl: async () => {
      throw new Error('disk scan failed')
    }
  })
  await router.onMessage(message({ text: '/列表' }))
  check('history 炸了：回复失败原因而不是沉默', lastText().length > 0, lastText())
  await router.onMessage(message({ text: '随便聊一句' }))
  check('普通闲聊：引导 /帮助', lastText().includes('/帮助'))
}

// ------------------------------------------------------------------ 国内 WorkBuddy：只开最近一场

{
  const { router, message, calls, lastText } = makeFixture()
  await router.onMessage(message({ text: '/打开' }))
  check('没接打开器：/打开 说明原因', lastText().includes('打开器'), lastText())
  check('没接打开器：不调用 resume', calls.resume === 0, String(calls.resume))
}

{
  const opened = makeFixture({
    openLatestWorkbuddyImpl: async () => ({ ok: true, message: '已在 WorkBuddy 里打开「上次那场」。' })
  })
  await opened.router.onMessage(opened.message({ text: '/打开' }))
  check('/打开 成功：调用打开器', opened.calls.openWorkbuddy === 1, String(opened.calls.openWorkbuddy))
  check('/打开 成功：回复 ✅', opened.lastText().includes('✅'), opened.lastText())
  check('/打开 成功：不走终端投喂', opened.lastText().includes('不会自动发消息'))
  check('/打开 成功：resume 与 send 都是 0', opened.calls.resume === 0 && opened.calls.send === 0)

  await opened.router.onMessage(opened.message({ text: '/列表' }))
  const listCard = opened.lastCard() as {
    elements?: Array<{ tag?: string; actions?: Array<{ value?: Record<string, unknown> }> }>
  }
  const buttons = listCard.elements?.flatMap((el) => el.actions ?? []) ?? []
  const pickButtons = buttons.filter((button) => button.value?.['cmd'] === 'pick')
  const openButtons = buttons.filter((button) => button.value?.['cmd'] === 'open-workbuddy')
  check('接上后列表仍是两个序号按钮', pickButtons.length === 2, String(pickButtons.length))
  check('接上后列表有打开上次的 WorkBuddy', openButtons.length === 1, String(openButtons.length))

  const toast = await opened.router.onCardAction(opened.cardAction({ cmd: 'open-workbuddy' })) as {
    toast?: { type?: string }
  }
  check('按钮打开：toast success', toast?.toast?.type === 'success')
  check('按钮打开：不调用 resume', opened.calls.resume === 0, String(opened.calls.resume))
  check('按钮打开：不调用 send', opened.calls.send === 0, String(opened.calls.send))
  check('按钮打开：打开器被再调一次', opened.calls.openWorkbuddy === 2, String(opened.calls.openWorkbuddy))
}

{
  const failed = makeFixture({
    openLatestWorkbuddyImpl: async () => ({ ok: false, message: '这台电脑上还没有国内 WorkBuddy 会话。' })
  })
  await failed.router.onMessage(failed.message({ text: '/open' }))
  check('/open 失败：❌ + 原因', failed.lastText().includes('❌') && failed.lastText().includes('还没有'), failed.lastText())
  check('/open 失败：不调用 resume', failed.calls.resume === 0)
}

{
  const exploded = makeFixture({
    openLatestWorkbuddyImpl: async () => {
      throw new Error('protocol missing')
    }
  })
  await exploded.router.onMessage(exploded.message({ text: '/打开' }))
  check('/打开 抛错：折成人话', exploded.lastText().includes('❌') && exploded.lastText().includes('protocol missing'), exploded.lastText())
}

{
  const empty = makeFixture({
    historyImpl: async () => [],
    openLatestWorkbuddyImpl: async () => ({ ok: true, message: '已打开。' })
  })
  await empty.router.onMessage(empty.message({ text: '/列表' }))
  const card = JSON.stringify(empty.lastCard())
  check('没有终端会话时仍给出 WorkBuddy 按钮', card.includes('open-workbuddy'), card)
  check('没有终端会话时不说先去跑几场就结束', !empty.lastText().includes('先在桌面端跑几场'))
}

// ------------------------------------------------------------------ DSH：把一场交给桌面 DSH 界面

{
  const { router, message, calls, lastText } = makeFixture()
  await router.onMessage(message({ text: '/dsh' }))
  check('没接 DSH 打开器：/dsh 说明原因', lastText().includes('DSH 打开器'), lastText())
  check('没接 DSH 打开器：不调用 resume', calls.resume === 0, String(calls.resume))
  check('没接 DSH 打开器：不调用 send', calls.send === 0, String(calls.send))
}

{
  const opened = makeFixture({
    openDshSessionImpl: async () => ({ ok: true, message: '已在 DSH 里打开「昨晚那场」。' })
  })
  await opened.router.onMessage(opened.message({ text: '/dsh' }))
  check('/dsh 成功：调用打开器', opened.calls.openDsh === 1, String(opened.calls.openDsh))
  check('/dsh 成功：回复 ✅', opened.lastText().includes('✅'), opened.lastText())
  check('/dsh 成功：带上会话名', opened.lastText().includes('昨晚那场'), opened.lastText())
  check('/dsh 成功：声明不走终端', opened.lastText().includes('不经过终端'), opened.lastText())
  check(
    '/dsh 不带序号：透传 undefined（= 最近一场）',
    opened.dshArgs.length === 1 && opened.dshArgs[0] === undefined,
    JSON.stringify(opened.dshArgs)
  )
  check(
    '/dsh 成功：resume 与 send 都是 0',
    opened.calls.resume === 0 && opened.calls.send === 0,
    `${opened.calls.resume}/${opened.calls.send}`
  )

  await opened.router.onMessage(opened.message({ text: '/列表' }))
  const listCard = opened.lastCard() as {
    elements?: Array<{ tag?: string; actions?: Array<{ value?: Record<string, unknown> }> }>
  }
  const buttons = listCard.elements?.flatMap((el) => el.actions ?? []) ?? []
  const dshButtons = buttons.filter((button) => button.value?.['cmd'] === 'open-dsh')
  check('接上后列表有 DSH 按钮', dshButtons.length === 1, String(dshButtons.length))
  check(
    'DSH 按钮文案点名 DSH',
    JSON.stringify(dshButtons[0]?.text ?? '').includes('DSH'),
    JSON.stringify(dshButtons[0])
  )
  check(
    '接上后列表仍只有序号按钮走 pick',
    buttons.filter((button) => button.value?.['cmd'] === 'pick').length === 2
  )

  const toast = (await opened.router.onCardAction(
    opened.cardAction({ cmd: 'open-dsh' })
  )) as { toast?: { type?: string; content?: string } }
  check('按钮打开 DSH：toast success', toast?.toast?.type === 'success', JSON.stringify(toast))
  check('按钮打开 DSH：toast 点名 DSH', toast?.toast?.content?.includes('DSH') === true)
  check('按钮打开 DSH：打开器被再调一次', opened.calls.openDsh === 2, String(opened.calls.openDsh))
  check('按钮打开 DSH：不碰 resume/send', opened.calls.resume === 0 && opened.calls.send === 0)
  check('按钮打开 DSH：私聊也收到 ✅', opened.lastText().includes('✅'), opened.lastText())
}

{
  // 列表按钮在没接打开器时也要能回人话，而不是静默失败。
  const noOpener = makeFixture()
  const toast = (await noOpener.router.onCardAction(
    noOpener.cardAction({ cmd: 'open-dsh' })
  )) as { toast?: { type?: string; content?: string } }
  check('没接打开器时点 DSH 按钮：toast error', toast?.toast?.type === 'error', JSON.stringify(toast))
  check('没接打开器时点 DSH 按钮：回人话', noOpener.lastText().includes('DSH 打开器'), noOpener.lastText())
}

{
  const failed = makeFixture({
    openDshSessionImpl: async () => ({ ok: false, message: '这台电脑上还没有 DSH 会话。' })
  })
  await failed.router.onMessage(failed.message({ text: '/dsh' }))
  check('/dsh 失败：❌ + 原因', failed.lastText().includes('❌') && failed.lastText().includes('还没有'), failed.lastText())
  check('/dsh 失败：不调用 resume', failed.calls.resume === 0, String(failed.calls.resume))

  const failToast = (await failed.router.onCardAction(
    failed.cardAction({ cmd: 'open-dsh' })
  )) as { toast?: { type?: string; content?: string } }
  check('按钮打开失败：toast error', failToast?.toast?.type === 'error', JSON.stringify(failToast))
  check(
    '按钮打开失败：toast 带原因',
    failToast?.toast?.content?.includes('还没有') === true,
    JSON.stringify(failToast)
  )
}

{
  const exploded = makeFixture({
    openDshSessionImpl: async () => {
      throw new Error('dsh surface missing')
    }
  })
  await exploded.router.onMessage(exploded.message({ text: '/dsh' }))
  check(
    '/dsh 抛错：折成人话',
    exploded.lastText().includes('❌') && exploded.lastText().includes('dsh surface missing'),
    exploded.lastText()
  )
  const boomToast = (await exploded.router.onCardAction(
    exploded.cardAction({ cmd: 'open-dsh' })
  )) as { toast?: { type?: string; content?: string } }
  check(
    '按钮打开抛错：toast error 带原因',
    boomToast?.toast?.type === 'error' &&
      boomToast.toast.content?.includes('dsh surface missing') === true,
    JSON.stringify(boomToast)
  )
}

{
  // dsh 会话不可终端恢复 → 它不参与 /列表 的序号，/继续 也不该被它影响。
  const mixed = makeFixture({
    openDshSessionImpl: async () => ({ ok: true, message: '已打开。' })
  })
  await mixed.router.onMessage(mixed.message({ text: '/列表' }))
  await mixed.router.onMessage(mixed.message({ text: '/继续 2' }))
  check('/继续 2 仍走普通 resume（dsh 不占序号）', mixed.calls.resume === 1, String(mixed.calls.resume))
  check('/继续 2 开的是 codex 那场', mixed.resumeArgs[0]?.sid === 'ses-2', JSON.stringify(mixed.resumeArgs))
  check('/继续 2 没惊动 DSH 打开器', mixed.calls.openDsh === 0, String(mixed.calls.openDsh))
}

{
  // 没有任何可恢复历史时，DSH 按钮仍要出现在兜底卡上。
  const empty = makeFixture({
    historyImpl: async () => [],
    openDshSessionImpl: async () => ({ ok: true, message: '已打开。' })
  })
  await empty.router.onMessage(empty.message({ text: '/列表' }))
  const card = JSON.stringify(empty.lastCard())
  check('没有终端会话时仍给出 DSH 按钮', card.includes('open-dsh'), card)
}

{
  // 安全边界：非配对人发 /dsh 也必须沉默。
  const guarded = makeFixture({
    paired: ['ou_other'],
    openDshSessionImpl: async () => ({ ok: true, message: '已打开。' })
  })
  await guarded.router.onMessage(guarded.message({ text: '/dsh' }))
  check('非配对人 /dsh：一条不回', guarded.sent.length === 0, String(guarded.sent.length))
  check('非配对人 /dsh：不惊动打开器', guarded.calls.openDsh === 0, String(guarded.calls.openDsh))
}

{
  const enqueued: Array<{ action: string; targetId: string; payload: Record<string, unknown> }> = []
  const now = Date.now()
  const self = { id: '11111111-2222-4333-8444-555555555555', name: '家里' }
  const office = { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', name: '办公室', seenAt: now }
  const fleet: FeishuFleetPort = {
    self: () => self,
    computers: async () => [office, { ...self, seenAt: now }],
    enqueue: async (command) => {
      enqueued.push({ action: command.action, targetId: command.targetId, payload: command.payload })
      return 'created'
    },
    publishSlots: async () => undefined,
    readSlots: async () => [
      {
        n: 1,
        computerId: office.id,
        computerName: office.name,
        sid: 'ses-office',
        agent: 'grok',
        title: '办公室那场'
      }
    ],
    remoteSessions: async () => [{ sid: 'ses-office', agent: 'grok', title: '办公室那场' }]
  }
  const handed = makeFixture({ fleet })
  await handed.router.onMessage(handed.message({ text: '/继续 1', messageId: 'om-handoff' }))
  check('点到别的电脑：不在本机 resume', handed.calls.resume === 0, String(handed.calls.resume))
  check('点到别的电脑：写入一条 resume 命令', enqueued.length === 1 && enqueued[0]?.action === 'resume' && enqueued[0]?.targetId === office.id)
  check('点到别的电脑：命令带上会话 id', enqueued[0]?.payload['sid'] === 'ses-office')
  check('点到别的电脑：回复已交给', handed.lastText().includes('已交给') && handed.lastText().includes('办公室'), handed.lastText())

  enqueued.length = 0
  const offline = makeFixture({
    fleet: {
      ...fleet,
      computers: async () => [{ ...office, seenAt: now - 10 * 60 * 1000 }]
    }
  })
  await offline.router.onMessage(offline.message({ text: '/继续 办公室 3', messageId: 'om-offline' }))
  check('点名不在线：不在本机 resume', offline.calls.resume === 0, String(offline.calls.resume))
  check('点名不在线：不写命令', enqueued.length === 0, String(enqueued.length))
  check('点名不在线：说明不在线', offline.lastText().includes('不在线'), offline.lastText())

  const local = makeFixture()
  await local.router.onMessage(local.message({ text: '/继续 办公室 3' }))
  check('没接多电脑时点名：不在本机 resume', local.calls.resume === 0, String(local.calls.resume))
  check('没接多电脑时点名：说明名单没接上', local.lastText().includes('多电脑名单'), local.lastText())
}

console.log(`\n通过 ${pass} · 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
