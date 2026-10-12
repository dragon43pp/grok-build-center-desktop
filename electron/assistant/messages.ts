/**
 * 消息读取、概要、以及「标题 + 正文」匹配。
 *
 * 定期任务和搜索按钮共用同一份 userData 索引。搜索时若索引还没覆盖到，
 * 会按时间从新到旧补读一批，并在时限内扫未索引文件里的原文。
 */
import type { AssistantConfig } from './store'
import { hasEndpoint, loadAssistantConfig } from './store'
import type { AssistantBrief, AssistantMessage, AssistantMessageCard, DigestStatus } from '../../shared/assistant'
import type { HistorySession } from '../../shared/session-history'
import { discoverSessions } from '../sessions'
import {
  loadDigestIndex,
  loadDigestStatus,
  loadMessageCard,
  saveDigestIndex,
  saveDigestStatus,
  saveMessageCard,
  listBriefs as listStoredBriefs,
  type DigestEntry
} from './digest-store'
import {
  buildExcerpt,
  clearTranscriptCaches,
  extractSession,
  fileWindow,
  resolveTranscript
} from './transcript'

const READ_BUDGET = 60
const SUMMARY_BUDGET = 6
const PASS_MS = 25_000
const SEARCH_FILL = 40
const SEARCH_SCAN_FILES = 160
const SEARCH_SCAN_MS = 8_000
const SUMMARY_TIMEOUT_MS = 45_000

let chain: Promise<unknown> = Promise.resolve()
let running = false

function withLock<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work)
  chain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export function digestIsRunning(): boolean {
  return running
}

export function currentDigestStatus(userDataDir: string): DigestStatus {
  return { ...loadDigestStatus(userDataDir), running }
}

export function currentBriefs(userDataDir: string): AssistantBrief[] {
  return listStoredBriefs(userDataDir)
}

export function currentMessageCard(userDataDir: string, key: string): AssistantMessageCard | null {
  if (!isSessionKey(key)) return null
  return loadMessageCard(userDataDir, key)
}

export function isSessionKey(key: string): boolean {
  return /^[a-z0-9-]+:[A-Za-z0-9_.:-]{1,200}$/.test(key)
}

export function textHits(query: string, haystack: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2 || !haystack) return false
  const hay = haystack.toLowerCase()
  if (hay.includes(needle)) return true
  const parts = needle.split(/\s+/).filter((part) => part.length >= 2)
  return parts.length >= 2 && parts.every((part) => hay.includes(part))
}

export function windowAround(text: string, query: string, radius = 450): string {
  if (!text) return ''
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase())
  if (idx < 0) return text.slice(0, radius * 2)
  const start = Math.max(0, idx - radius)
  const slice = text.slice(start, idx + query.trim().length + radius)
  return start > 0 ? `…${slice}` : slice
}

function sessionKey(session: HistorySession): string {
  return `${session.agent}:${session.id}`
}

function activity(session: HistorySession): number {
  const stamp = session.updatedAt ?? session.createdAt
  if (!stamp) return 0
  const parsed = Date.parse(stamp)
  return Number.isNaN(parsed) ? 0 : parsed
}

function entryFromHit(
  session: HistorySession,
  hit: { path: string; mtimeMs: number; bytes: number; messages: AssistantMessage[] }
): DigestEntry {
  return {
    title: session.title,
    cwd: session.cwd,
    updatedAt: session.updatedAt,
    sourcePath: hit.path,
    sourceMtimeMs: hit.mtimeMs,
    sourceBytes: hit.bytes,
    messageCount: hit.messages.length,
    summary: '',
    excerpt: buildExcerpt(hit.messages),
    summarizedSourceMtimeMs: null,
    readAt: new Date().toISOString()
  }
}

async function rememberSession(
  userDataDir: string,
  entries: Record<string, DigestEntry>,
  session: HistorySession
): Promise<DigestEntry | null> {
  const key = sessionKey(session)
  const hit = await extractSession(session)
  if (!hit || hit.messages.length === 0) return entries[key] ?? null
  const previous = entries[key]
  const entry: DigestEntry = {
    ...entryFromHit(session, hit),
    summary: previous?.summary ?? '',
    summarizedSourceMtimeMs: previous?.summarizedSourceMtimeMs ?? null
  }
  if (previous && previous.sourceMtimeMs !== hit.mtimeMs) {
    entry.summary = ''
    entry.summarizedSourceMtimeMs = null
  }
  entries[key] = entry
  saveMessageCard(userDataDir, key, entry.summary, hit.messages)
  return entry
}

export async function runDigestPass(userDataDir: string): Promise<DigestStatus> {
  return withLock(() => runDigestPassLocked(userDataDir))
}

async function runDigestPassLocked(userDataDir: string): Promise<DigestStatus> {
  running = true
  const started = Date.now()
  let lastRead = 0
  let lastSummarized = 0
  let lastError: string | null = null
  let summaryNote: string | null = null
  try {
    clearTranscriptCaches()
    const discovered = await discoverSessions()
    const sessions = [...discovered.sessions].sort((a, b) => activity(b) - activity(a))
    const index = loadDigestIndex(userDataDir)
    const entries = index.entries
    for (const session of sessions) {
      if (lastRead >= READ_BUDGET || Date.now() - started > PASS_MS) break
      const key = sessionKey(session)
      const previous = entries[key]
      const path = await resolveTranscript(session)
      if (!path) continue
      if (previous?.sourcePath === path && previous.excerpt && previous.sourceMtimeMs > 0) {
        try {
          const { stat } = await import('node:fs/promises')
          const info = await stat(path)
          if (info.mtimeMs === previous.sourceMtimeMs && previous.messageCount > 0) continue
        } catch {
          continue
        }
      }
      const saved = await rememberSession(userDataDir, entries, session)
      if (saved) lastRead += 1
    }

    const config = loadAssistantConfig(userDataDir)
    if (!hasEndpoint(config)) {
      summaryNote = '端点、密钥、模型齐了之后，下一次读取会补详细概要'
    } else {
      const pending = sessions
        .map((session) => entries[sessionKey(session)])
        .filter(
          (entry): entry is DigestEntry =>
            !!entry &&
            entry.messageCount > 0 &&
            entry.summarizedSourceMtimeMs !== entry.sourceMtimeMs
        )
        .slice(0, SUMMARY_BUDGET)
      for (const entry of pending) {
        const key = Object.keys(entries).find((candidate) => entries[candidate] === entry)
        if (!key) continue
        const card = loadMessageCard(userDataDir, key)
        const summary = await summarize(config, entry.title, entry.cwd, card?.messages ?? [])
        if (!summary) continue
        entry.summary = summary
        entry.summarizedSourceMtimeMs = entry.sourceMtimeMs
        entries[key] = entry
        if (card) saveMessageCard(userDataDir, key, summary, card.messages)
        lastSummarized += 1
      }
    }
    const fresh = loadDigestIndex(userDataDir).entries
    for (const [key, entry] of Object.entries(fresh)) {
      if (!entries[key]) entries[key] = entry
    }
    saveDigestIndex(userDataDir, entries)
    const summarized = Object.values(entries).filter((entry) => entry.summary.trim() !== '').length
    const status: DigestStatus = {
      running: false,
      lastRunAt: new Date().toISOString(),
      lastError: null,
      summaryNote,
      indexed: Object.keys(entries).length,
      summarized,
      lastRead,
      lastSummarized
    }
    saveDigestStatus(userDataDir, status)
    return status
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
    const previous = loadDigestStatus(userDataDir)
    const status: DigestStatus = {
      ...previous,
      running: false,
      lastRunAt: new Date().toISOString(),
      lastError,
      summaryNote,
      lastRead,
      lastSummarized
    }
    saveDigestStatus(userDataDir, status)
    return status
  } finally {
    running = false
  }
}

async function summarize(
  config: AssistantConfig,
  title: string,
  cwd: string,
  messages: readonly { role: string; text: string }[]
): Promise<string | null> {
  const body = messages
    .map((message) => `${message.role === 'user' ? '用户' : '助手'}: ${message.text}`)
    .join('\n')
    .slice(-16_000)
  if (!body.trim()) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS)
  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 1200,
        stream: false,
        messages: [
          {
            role: 'system',
            content:
              '你在给一场本地 AI 会话写详细概要。用中文，250 到 700 字。按顺序写清：用户要做什么、助手实际改了哪些文件、跑了什么命令、得到什么结论、还剩什么没做完。只根据给出的消息，不编造。'
          },
          {
            role: 'user',
            content: `标题：${title}\n目录：${cwd || '-'}\n\n${body}`
          }
        ]
      }),
      signal: controller.signal
    })
    if (!response.ok) return null
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = payload.choices?.[0]?.message?.content
    return typeof content === 'string' ? content.trim().slice(0, 1_800) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface MessageSearchPack {
  localKeys: string[]
  snippets: Array<{ key: string; title: string; summary: string; excerpt: string }>
}

/** 本地搜索框用：只查已有索引，不重新扫盘。标题匹配由渲染进程自己做。 */
export function matchIndexed(userDataDir: string, query: string): string[] {
  const entries = loadDigestIndex(userDataDir).entries
  return Object.entries(entries)
    .filter(([, entry]) =>
      textHits(query, [entry?.title ?? '', entry?.cwd ?? '', entry?.summary ?? '', entry?.excerpt ?? ''].join('\n'))
    )
    .slice(0, 80)
    .map(([key]) => key)
}

export async function collectMessageSearch(
  userDataDir: string,
  sessions: readonly HistorySession[],
  query: string
): Promise<MessageSearchPack> {
  return withLock(() => collectLocked(userDataDir, sessions, query))
}

async function collectLocked(
  userDataDir: string,
  sessions: readonly HistorySession[],
  query: string
): Promise<MessageSearchPack> {
  const ranked = [...sessions].sort((a, b) => activity(b) - activity(a))
  const index = loadDigestIndex(userDataDir)
  const entries = index.entries
  let filled = 0
  for (const session of ranked) {
    if (filled >= SEARCH_FILL) break
    const key = sessionKey(session)
    if (entries[key]?.excerpt) continue
    const saved = await rememberSession(userDataDir, entries, session)
    if (saved?.excerpt) filled += 1
  }

  const deadline = Date.now() + SEARCH_SCAN_MS
  let scanned = 0
  const windows = new Map<string, string>()
  for (const session of ranked) {
    if (scanned >= SEARCH_SCAN_FILES || Date.now() > deadline) break
    const key = sessionKey(session)
    if (entries[key]?.excerpt && textHits(query, `${session.title}\n${entries[key].excerpt}\n${entries[key].summary}`)) {
      continue
    }
    if (textHits(query, session.title)) continue
    const path = entries[key]?.sourcePath ?? (await resolveTranscript(session))
    if (!path) continue
    scanned += 1
    const found = await fileWindow(path, query, deadline)
    if (!found) continue
    windows.set(key, found)
    await rememberSession(userDataDir, entries, session)
    const entry = entries[key]
    if (entry && !textHits(query, entry.excerpt)) {
      entry.excerpt = `${entry.excerpt}\n${found}`.slice(-8_000)
      entries[key] = entry
    }
  }
  if (filled > 0 || scanned > 0) {
    const fresh = loadDigestIndex(userDataDir).entries
    for (const [key, entry] of Object.entries(fresh)) {
      if (!entries[key]) entries[key] = entry
    }
    saveDigestIndex(userDataDir, entries)
  }

  const hits: HistorySession[] = []
  for (const session of ranked) {
    const key = sessionKey(session)
    const entry = entries[key]
    const haystack = [session.title, session.cwd, entry?.summary ?? '', entry?.excerpt ?? '', windows.get(key) ?? ''].join('\n')
    if (textHits(query, haystack) || windows.has(key)) hits.push(session)
  }
  const localKeys = hits.slice(0, 80).map(sessionKey)
  const snippets = hits.slice(0, 24).map((session) => {
    const key = sessionKey(session)
    const entry = entries[key]
    const excerpt = windows.get(key) ?? windowAround(entry?.excerpt ?? '', query)
    const summary = entry?.summary?.trim() ?? ''
    return {
      key,
      title: session.title,
      summary,
      excerpt: summary ? `概要：${summary}\n消息：${excerpt}` : excerpt
    }
  })
  return { localKeys, snippets }
}

export async function readSessionDetail(
  userDataDir: string,
  session: {
    agent: string
    id: string
    path: string
    title: string
    cwd: string
    updatedAt: string | null
  }
): Promise<AssistantMessageCard | null> {
  const key = `${session.agent}:${session.id}`
  if (!isSessionKey(key)) return null
  const hit = await extractSession(session)
  if (!hit || hit.messages.length === 0) return loadMessageCard(userDataDir, key)
  const index = loadDigestIndex(userDataDir)
  const previous = index.entries[key]
  const sameSource = previous?.sourceMtimeMs === hit.mtimeMs
  const entry: DigestEntry = {
    title: session.title || previous?.title || '',
    cwd: session.cwd || previous?.cwd || '',
    updatedAt: session.updatedAt ?? previous?.updatedAt ?? null,
    sourcePath: hit.path,
    sourceMtimeMs: hit.mtimeMs,
    sourceBytes: hit.bytes,
    messageCount: hit.messages.length,
    summary: sameSource ? (previous?.summary ?? '') : '',
    excerpt: buildExcerpt(hit.messages),
    summarizedSourceMtimeMs: sameSource ? (previous?.summarizedSourceMtimeMs ?? null) : null,
    readAt: new Date().toISOString()
  }
  index.entries[key] = entry
  saveDigestIndex(userDataDir, index.entries)
  saveMessageCard(userDataDir, key, entry.summary, hit.messages)
  return { key, summary: entry.summary, messages: hit.messages }
}


