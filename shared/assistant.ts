/**
 * AI 助手（会话历史智能查找）契约。
 *
 * ASC 自己不内置任何模型 —— 用户在设置里配一个 OpenAI 兼容端点
 * （baseURL + apiKey + model）。两步能力各自一个开关，互不绑定：
 *   1. digestEnabled：定期读取本机会话正文，并在端点可用时写详细概要。
 *   2. messageSearchEnabled：本地搜索和 AI 查找同时匹配标题与消息正文。
 *
 * 安全边界：
 * - apiKey 只存主进程侧 userData，永不回传渲染进程（GetConfig 返回 masked）。
 * - 概要和消息摘录只写 ASC 自己的 userData，不写各 agent 的数据目录。
 * - 只有打开「搜索标题和消息正文」并且 AI 查找会调用模型时，摘录才会发到用户自己的端点。
 * - 主进程对会话数据永远只读：删除 = 移入系统回收站（可恢复）或本机视图隐藏。
 */

export const AssistantInvokeChannel = {
  GetConfig: 'assistant:get-config',
  SaveConfig: 'assistant:save-config',
  TestConfig: 'assistant:test-config',
  Search: 'assistant:search',
  DigestStatus: 'assistant:digest-status',
  RunDigest: 'assistant:digest-run',
  MatchMessages: 'assistant:match-messages',
  MessageCard: 'assistant:message-card',
  ListBriefs: 'assistant:list-briefs'
} as const

export interface AssistantConfigInput {
  /** OpenAI 兼容端点根，如 `https://api.example.com/v1`。 */
  baseURL: string
  apiKey: string
  model: string
  enabled: boolean
  /** 省略 = 保存时保留已有值。 */
  digestEnabled?: boolean
  /** 省略 = 保存时保留已有值。 */
  messageSearchEnabled?: boolean
}

export interface AssistantConfigStatus {
  baseURL: string
  model: string
  enabled: boolean
  digestEnabled: boolean
  messageSearchEnabled: boolean
  /** 有没有配 key（true = 已配置）。明文永不回传。 */
  hasApiKey: boolean
  /** 回显用掩码，如 `sk-***abc1`。未配置时为 null。 */
  apiKeyMasked: string | null
}

export interface DigestStatus {
  running: boolean
  lastRunAt: string | null
  lastError: string | null
  /** 端点未配好时，读取仍进行，概要记在这里。 */
  summaryNote: string | null
  indexed: number
  summarized: number
  lastRead: number
  lastSummarized: number
}

export interface AssistantMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface AssistantBrief {
  key: string
  summary: string
  messageCount: number
}

export interface AssistantMessageCard {
  key: string
  summary: string
  messages: AssistantMessage[]
}

/** 展开一场时带上定位字段，主进程没有卡片就当场读正文。 */
export interface AssistantMessageCardRequest {
  key: string
  agent?: string
  id?: string
  path?: string
  title?: string
  cwd?: string
  updatedAt?: string | null
}

export interface AssistantMatchRequest {
  query: string
}

export interface AssistantMatchResponse {
  enabled: boolean
  sessionKeys: string[]
  tookMs: number
}

export interface AssistantSearchRequest {
  query: string
  /**
   * 多轮对话：渲染进程带上最近几轮（最老在前）。主进程裁剪到 6 轮。
   * 只透传文本，不透传其它角色内容。
   */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface AssistantSearchResponse {
  ok: boolean
  /** 模型给的人话结论（已按配置语言回答，默认中文）。 */
  answer: string
  /** 命中场次，key = `${agent}:${id}`，与会话历史页行 key 同构。 */
  sessionKeys: string[]
  tookMs: number
  /** 失败时的机器可读码：not_configured / http_<status> / bad_response / timeout */
  errorCode?: string
  errorMessage?: string
}

export interface AssistantTestResult {
  ok: boolean
  /** 简短回显，如 `gpt-4o · 200 OK`。失败时是人话原因。 */
  message: string
}

export interface AssistantApi {
  getConfig: () => Promise<AssistantConfigStatus>
  /** 传 apiKey 为空字符串 = 不修改现有 key。 */
  saveConfig: (config: AssistantConfigInput) => Promise<AssistantConfigStatus>
  testConfig: () => Promise<AssistantTestResult>
  search: (request: AssistantSearchRequest) => Promise<AssistantSearchResponse>
  digestStatus: () => Promise<DigestStatus>
  /** 立刻读一批消息并补概要。不改变定期开关。 */
  runDigest: () => Promise<DigestStatus>
  matchMessages: (request: AssistantMatchRequest) => Promise<AssistantMatchResponse>
  messageCard: (request: string | AssistantMessageCardRequest) => Promise<AssistantMessageCard | null>
  listBriefs: () => Promise<AssistantBrief[]>
}
