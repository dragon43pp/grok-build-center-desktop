/**
 * 智能查找：把会话清单（元数据）发给用户自配的 OpenAI 兼容端点，
 * 让模型挑出命中场次。唯一一次 LLM 往返，无流式、无工具循环 ——
 * 会话管理操作的执行权在渲染进程（用户点按钮），模型只负责「找」和「说」。
 */
import type {
  AssistantSearchRequest,
  AssistantSearchResponse
} from '../../shared/assistant'
import type { HistorySession } from '../../shared/session-history'
import type { AssistantConfig } from './store'
import { isConfigured } from './store'
import type { MessageSearchPack } from './messages'

/** 清单上限： Recent 400 场足够覆盖查找需求，也控住 token 预算。 */
const INVENTORY_LIMIT = 400
const CHAT_HISTORY_LIMIT = 6
const REQUEST_TIMEOUT_MS = 60_000

const MESSAGE_SYSTEM_PROMPT = [
  '你是「ASC 会话历史」的检索助手。用户在管理多个本地 AI 会话。',
  '下面每行是：key | agent | 标题 | 消息摘录。摘录来自本机读到的对话正文和概要。',
  '标题和消息正文都要用来判断，不要只看标题。',
  '可以命中 0 条，不要硬凑。用中文给一句简短结论。',
  '只输出一个 JSON 对象，不要 markdown 代码块，格式：',
  '{"answer": "中文结论", "sessionKeys": ["grok:abc"]}',
  'sessionKeys 必须逐字取自清单第一列的 key。'
].join('\n')

const SYSTEM_PROMPT = [
  '你是「ASC 会话历史」的检索助手。用户在管理多个 AI CLI（grok/codex/claude/opencode/kimi/pi/antigravity/workbuddy/workbuddy-ai）的本地会话历史。',
  '下面给你一份会话清单（每行：key | agent | 标题 | 工作目录 | 模型 | 更新时间 | 消息数 | tokens）。',
  '用户的问题是自然语言查找请求，例如「找上周关于飞书路由的 codex 会话」「哪些会话在做日报自动化」「帮我找重复的会话」。',
  '你的任务：',
  '1. 从清单里挑出命中的场次（可以命中 0 条，不要硬凑）。',
  '2. 用中文给一句简短结论（不超过 3 句话），点明你按什么特征挑的、有什么值得注意的（比如明显重复的分组）。',
  '只输出一个 JSON 对象，不要 markdown 代码块，不要解释其它内容，格式：',
  '{"answer": "中文结论", "sessionKeys": ["grok:abc", "codex:def"]}',
  'sessionKeys 必须逐字取自清单第一列的 key。'
].join('\n')

function inventoryLine(session: HistorySession): string {
  const when = session.updatedAt ?? session.createdAt ?? 'unknown'
  const title = session.title.replace(/[|\n]/g, ' ').slice(0, 80)
  const cwd = session.cwd.replace(/[|\n]/g, ' ').slice(0, 80)
  return [
    `${session.agent}:${session.id}`,
    session.agent,
    title,
    cwd || '-',
    session.model || '-',
    when,
    String(session.messageCount),
    String(session.usage.total)
  ].join(' | ')
}

export function buildInventory(sessions: readonly HistorySession[]): string {
  return sessions.slice(0, INVENTORY_LIMIT).map(inventoryLine).join('\n')
}

/**
 * 系统提示词注入清单后拼成的用户消息首段；单测用它断言清单确实在场。
 */
export function buildUserPrompt(sessions: readonly HistorySession[], query: string): string {
  return `会话清单（最多 ${INVENTORY_LIMIT} 条，按最近排序）：\n${buildInventory(sessions)}\n\n用户请求：${query}`
}

interface ChatChoice {
  message?: { content?: unknown }
}

interface ChatResponseShape {
  choices?: ChatChoice[]
}

function parseModelReply(raw: string): { answer: string; sessionKeys: string[] } {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return { answer: text || '（模型没有返回内容）', sessionKeys: [] }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      answer?: unknown
      sessionKeys?: unknown
    }
    const keys = Array.isArray(parsed.sessionKeys)
      ? parsed.sessionKeys.filter((k): k is string => typeof k === 'string')
      : []
    return {
      answer: typeof parsed.answer === 'string' ? parsed.answer : '（模型没有返回结论）',
      sessionKeys: keys
    }
  } catch {
    return { answer: text.slice(0, 500), sessionKeys: [] }
  }
}

function buildMessagePrompt(
  sessions: readonly HistorySession[],
  pack: MessageSearchPack,
  query: string
): string {
  const lines = pack.snippets
    .map((snippet) => {
      const title = snippet.title.replace(/[|\n]/g, ' ').slice(0, 120)
      const excerpt = snippet.excerpt.replace(/\s+/g, ' ').slice(0, 700)
      return `${snippet.key} | ${snippet.key.split(':')[0]} | ${title} | ${excerpt || '-'}`
    })
    .join('\n')
  return [
    `会话清单（最多 ${INVENTORY_LIMIT} 条，按最近排序；标题、目录、模型都在）：`,
    buildInventory(sessions),
    '',
    '本机消息摘录（和标题一起判断，不要只看标题）：',
    lines || '（正文没有直接字面命中，请按上面的标题清单判断）',
    '',
    `用户请求：${query}`
  ].join('\n')
}

export async function assistantSearch(
  config: AssistantConfig,
  sessions: readonly HistorySession[],
  request: AssistantSearchRequest,
  messagePack?: MessageSearchPack
): Promise<AssistantSearchResponse> {
  const started = Date.now()
  const query = request.query.trim()
  if (query === '') {
    return { ok: false, answer: '', sessionKeys: [], tookMs: 0, errorCode: 'bad_response', errorMessage: '问题为空' }
  }
  const messageSearch = messagePack !== undefined
  if (!isConfigured(config)) {
    if (messageSearch) {
      return {
        ok: true,
        answer:
          messagePack.localKeys.length > 0
            ? `按标题和消息正文命中 ${messagePack.localKeys.length} 场。模型端点未启用，这是本机匹配。`
            : '标题和消息正文里都没有这句。模型端点未启用。',
        sessionKeys: messagePack.localKeys,
        tookMs: Date.now() - started
      }
    }
    return {
      ok: false,
      answer: '',
      sessionKeys: [],
      tookMs: 0,
      errorCode: 'not_configured',
      errorMessage: 'AI 助手未配置：请到 设置 → AI 助手 填端点、密钥和模型'
    }
  }

  const history = (request.history ?? [])
    .filter(
      (turn): turn is { role: 'user' | 'assistant'; content: string } =>
        (turn.role === 'user' || turn.role === 'assistant') &&
        typeof turn.content === 'string' &&
        turn.content.trim() !== ''
    )
    .slice(-CHAT_HISTORY_LIMIT)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 2000) }))

  const messages = [
    { role: 'system' as const, content: messageSearch ? MESSAGE_SYSTEM_PROMPT : SYSTEM_PROMPT },
    ...history,
    {
      role: 'user' as const,
      content:
        messageSearch && messagePack
          ? buildMessagePrompt(sessions, messagePack, query)
          : buildUserPrompt(sessions, query)
    }
  ]

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.2,
        stream: false
      }),
      signal: controller.signal
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      if (messageSearch && messagePack.localKeys.length > 0) {
        return {
          ok: true,
          answer: `按标题和消息正文命中 ${messagePack.localKeys.length} 场。模型端点返回 ${response.status}。`,
          sessionKeys: messagePack.localKeys,
          tookMs: Date.now() - started
        }
      }
      return {
        ok: false,
        answer: '',
        sessionKeys: [],
        tookMs: Date.now() - started,
        errorCode: `http_${response.status}`,
        errorMessage: `端点返回 ${response.status}${body ? `：${body.slice(0, 200)}` : ''}`
      }
    }
    const payload = (await response.json()) as ChatResponseShape
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return {
        ok: false,
        answer: '',
        sessionKeys: [],
        tookMs: Date.now() - started,
        errorCode: 'bad_response',
        errorMessage: '端点响应里没有 choices[0].message.content'
      }
    }
    const parsed = parseModelReply(content)
    // 只保留清单里真实存在的 key，防止模型编造。
    // 消息搜索时本机原文命中也要留下，不能只信模型挑的标题。
    const known = new Set(
      (messageSearch ? sessions : sessions.slice(0, INVENTORY_LIMIT)).map((s) => `${s.agent}:${s.id}`)
    )
    const modelKeys = [...new Set(parsed.sessionKeys)].filter((key) => known.has(key))
    const sessionKeys = messageSearch
      ? [...new Set([...messagePack.localKeys, ...modelKeys])].filter((key) => known.has(key))
      : modelKeys
    const answer =
      messageSearch && messagePack.localKeys.length > 0 && !parsed.answer.includes('消息')
        ? `${parsed.answer} 本机标题和消息正文直接命中 ${messagePack.localKeys.length} 场。`
        : parsed.answer
    return {
      ok: true,
      answer,
      sessionKeys,
      tookMs: Date.now() - started
    }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    if (messageSearch && messagePack.localKeys.length > 0) {
      return {
        ok: true,
        answer: `按标题和消息正文命中 ${messagePack.localKeys.length} 场。模型这次没有返回结论。`,
        sessionKeys: messagePack.localKeys,
        tookMs: Date.now() - started
      }
    }
    return {
      ok: false,
      answer: '',
      sessionKeys: [],
      tookMs: Date.now() - started,
      errorCode: aborted ? 'timeout' : 'bad_response',
      errorMessage: aborted
        ? `请求超时（${REQUEST_TIMEOUT_MS / 1000}s）`
        : error instanceof Error
          ? error.message
          : String(error)
    }
  }
}

/** 连通性自检：发一个 1-token 的 ping。 */
export async function assistantPing(config: AssistantConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.baseURL || !config.apiKey || !config.model) {
    return { ok: false, message: '端点 / 密钥 / 模型 三项都要填' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false
      }),
      signal: controller.signal
    })
    if (!response.ok) return { ok: false, message: `端点返回 ${response.status}` }
    return { ok: true, message: `${config.model} · 200 OK` }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.name === 'AbortError' ? '连接超时（15s）' : '连不上端点'
    }
  }
}
