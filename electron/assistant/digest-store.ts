/**
 * 消息索引只写 ASC 的 userData。agent 自己的目录保持只读。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AssistantBrief, AssistantMessage, AssistantMessageCard, DigestStatus } from '../../shared/assistant'

export interface DigestEntry {
  title: string
  cwd: string
  updatedAt: string | null
  sourcePath: string | null
  sourceMtimeMs: number
  sourceBytes: number
  messageCount: number
  summary: string
  excerpt: string
  summarizedSourceMtimeMs: number | null
  readAt: string
}

interface DigestIndex {
  version: 1
  updatedAt: string
  entries: Record<string, DigestEntry>
}

const EMPTY_STATUS: DigestStatus = {
  running: false,
  lastRunAt: null,
  lastError: null,
  summaryNote: null,
  indexed: 0,
  summarized: 0,
  lastRead: 0,
  lastSummarized: 0
}

function rootDir(userDataDir: string): string {
  return join(userDataDir, 'assistant-digest')
}

function indexPath(userDataDir: string): string {
  return join(rootDir(userDataDir), 'index.json')
}

function statusPath(userDataDir: string): string {
  return join(rootDir(userDataDir), 'status.json')
}

function cardPath(userDataDir: string, key: string): string {
  const safe = key.replace(/[^A-Za-z0-9._-]+/g, '_')
  return join(rootDir(userDataDir), 'cards', `${safe}.json`)
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value), 'utf8')
  renameSync(tmp, path)
}

export function loadDigestIndex(userDataDir: string): DigestIndex {
  try {
    const parsed: unknown = JSON.parse(readFileSync(indexPath(userDataDir), 'utf8'))
    if (!parsed || typeof parsed !== 'object') return { version: 1, updatedAt: '', entries: {} }
    const record = parsed as { entries?: unknown }
    const entries =
      record.entries && typeof record.entries === 'object'
        ? (record.entries as Record<string, DigestEntry>)
        : {}
    return { version: 1, updatedAt: '', entries }
  } catch {
    return { version: 1, updatedAt: '', entries: {} }
  }
}

export function saveDigestIndex(userDataDir: string, entries: Record<string, DigestEntry>): void {
  const index: DigestIndex = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries
  }
  writeJson(indexPath(userDataDir), index)
}

export function saveMessageCard(
  userDataDir: string,
  key: string,
  summary: string,
  messages: readonly AssistantMessage[]
): void {
  const card: AssistantMessageCard = { key, summary, messages: [...messages] }
  writeJson(cardPath(userDataDir, key), card)
}

export function loadMessageCard(userDataDir: string, key: string): AssistantMessageCard | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(cardPath(userDataDir, key), 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as { summary?: unknown; messages?: unknown }
    const messages = Array.isArray(record.messages)
      ? record.messages.filter(
          (item): item is AssistantMessage =>
            !!item &&
            typeof item === 'object' &&
            ((item as AssistantMessage).role === 'user' || (item as AssistantMessage).role === 'assistant') &&
            typeof (item as AssistantMessage).text === 'string'
        )
      : []
    return {
      key,
      summary: typeof record.summary === 'string' ? record.summary : '',
      messages
    }
  } catch {
    return null
  }
}

export function listBriefs(userDataDir: string): AssistantBrief[] {
  const index = loadDigestIndex(userDataDir)
  const briefs: AssistantBrief[] = []
  for (const [key, entry] of Object.entries(index.entries)) {
    if (!entry || (entry.messageCount <= 0 && !entry.summary)) continue
    briefs.push({
      key,
      summary: typeof entry.summary === 'string' ? entry.summary : '',
      messageCount: typeof entry.messageCount === 'number' ? entry.messageCount : 0
    })
  }
  return briefs
}

export function loadDigestStatus(userDataDir: string): DigestStatus {
  try {
    const parsed: unknown = JSON.parse(readFileSync(statusPath(userDataDir), 'utf8'))
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_STATUS }
    const record = parsed as Partial<DigestStatus>
    return {
      running: false,
      lastRunAt: typeof record.lastRunAt === 'string' ? record.lastRunAt : null,
      lastError: typeof record.lastError === 'string' ? record.lastError : null,
      summaryNote: typeof record.summaryNote === 'string' ? record.summaryNote : null,
      indexed: typeof record.indexed === 'number' ? record.indexed : 0,
      summarized: typeof record.summarized === 'number' ? record.summarized : 0,
      lastRead: typeof record.lastRead === 'number' ? record.lastRead : 0,
      lastSummarized: typeof record.lastSummarized === 'number' ? record.lastSummarized : 0
    }
  } catch {
    return { ...EMPTY_STATUS }
  }
}

export function saveDigestStatus(userDataDir: string, status: DigestStatus): void {
  const stored = { ...status, running: false }
  writeJson(statusPath(userDataDir), stored)
}
