/**
 * 从各 agent 已经落盘的记录里抽出用户/助手正文。
 *
 * 只读。不写 agent 目录。长文件只读尾部，避免把几 GB 的 jsonl 整份拉进内存。
 */
import { open, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { exists, isDirectory, listDir } from '../sessions/fsUtil'
import { workbuddyAiHome, workbuddyHome } from '../sessions/paths'
import type { AssistantMessage } from '../../shared/assistant'

const TAIL_BYTES = 768 * 1024
const MAX_MESSAGES = 36
const MAX_MESSAGE_CHARS = 3_000

const SKIP_TYPES = new Set([
  'system',
  'file-history-snapshot',
  'snapshot',
  'reasoning',
  'queue-operation',
  'summary',
  'event_msg',
  'token_count',
  'turn_aborted'
])

export interface TranscriptHit {
  path: string
  mtimeMs: number
  bytes: number
  messages: AssistantMessage[]
}

const projectMaps = new Map<string, Map<string, string>>()

export function clearTranscriptCaches(): void {
  projectMaps.clear()
}

export async function workbuddyTranscriptMap(home: string): Promise<Map<string, string>> {
  const cached = projectMaps.get(home)
  if (cached) return cached
  const map = new Map<string, string>()
  const projects = join(home, 'projects')
  if (!(await isDirectory(projects))) {
    projectMaps.set(home, map)
    return map
  }
  for (const dir of await listDir(projects)) {
    const projectDir = join(projects, dir)
    if (!(await isDirectory(projectDir))) continue
    for (const file of await listDir(projectDir)) {
      if (!file.endsWith('.jsonl')) continue
      const id = file.slice(0, -'.jsonl'.length)
      if (!map.has(id)) map.set(id, join(projectDir, file))
    }
  }
  projectMaps.set(home, map)
  return map
}

async function largestExisting(paths: readonly string[]): Promise<string | null> {
  let best: { path: string; size: number } | null = null
  for (const path of paths) {
    if (!(await exists(path))) continue
    try {
      const info = await stat(path)
      if (!info.isFile() || info.size <= 0) continue
      if (!best || info.size > best.size) best = { path, size: info.size }
    } catch {
      /* 文件在扫的过程中消失：跳过 */
    }
  }
  return best?.path ?? null
}

export async function resolveTranscript(session: {
  agent: string
  id: string
  path: string
}): Promise<string | null> {
  const path = session.path
  if (path.endsWith('.jsonl') && (await exists(path))) return path
  if (session.agent === 'workbuddy' || session.agent === 'workbuddy-ai') {
    const home = session.agent === 'workbuddy-ai' ? workbuddyAiHome() : workbuddyHome()
    const map = await workbuddyTranscriptMap(home)
    return map.get(session.id) ?? null
  }
  if (await isDirectory(path)) {
    return largestExisting([
      join(path, 'chat_history.jsonl'),
      join(path, 'updates.jsonl'),
      join(path, 'agents', 'main', 'wire.jsonl'),
      join(path, '.system_generated', 'logs', 'transcript_full.jsonl'),
      join(path, '.system_generated', 'logs', 'transcript.jsonl')
    ])
  }
  return null
}

export function messageFromRecord(line: string): AssistantMessage | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as Record<string, unknown>
  const type = typeof record['type'] === 'string' ? record['type'] : ''
  if (SKIP_TYPES.has(type)) return null
  const role = pickRole(record, type)
  if (!role) return null
  const text = pickText(record).replace(/\s+\n/g, '\n').trim()
  if (!text) return null
  return { role, text: text.slice(0, MAX_MESSAGE_CHARS) }
}

function pickRole(record: Record<string, unknown>, type: string): AssistantMessage['role'] | null {
  const direct = record['role']
  if (direct === 'user' || direct === 'assistant') return direct
  const message = record['message']
  if (message && typeof message === 'object') {
    const nested = (message as { role?: unknown }).role
    if (nested === 'user' || nested === 'assistant') return nested
  }
  if (type === 'user' || type === 'assistant') return type
  if (type === 'function_call' || type === 'function_call_result' || type === 'tool_use' || type === 'tool_result') {
    return 'assistant'
  }
  return null
}

function pickText(value: unknown, depth = 0): string {
  if (depth > 5 || value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => pickText(item, depth + 1))
      .filter((part) => part.trim() !== '')
      .join('\n')
  }
  if (typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  if (typeof record['text'] === 'string' && record['text'].trim()) return record['text']
  if (record['content'] != null) {
    const nested = pickText(record['content'], depth + 1)
    if (nested.trim()) return nested
  }
  if (record['message'] != null) {
    const nested = pickText(record['message'], depth + 1)
    if (nested.trim()) return nested
  }
  if (typeof record['rawContent'] === 'string' && record['rawContent'].trim()) return record['rawContent']
  if (typeof record['name'] === 'string' && record['name'].trim()) {
    const name = record['name'].trim()
    return name.length > 80 ? `调用 ${name.slice(0, 80)}` : `调用 ${name}`
  }
  return ''
}

export function messagesFromJsonl(text: string): AssistantMessage[] {
  const out: AssistantMessage[] = []
  for (const line of text.split('\n')) {
    const message = messageFromRecord(line)
    if (message) out.push(message)
  }
  return out.slice(-MAX_MESSAGES)
}

export function buildExcerpt(messages: readonly AssistantMessage[]): string {
  if (messages.length === 0) return ''
  const head = messages.slice(0, 2)
  const tail = messages.slice(-16)
  const seen = new Set<AssistantMessage>()
  const picked = [...head, ...tail].filter((message) => {
    if (seen.has(message)) return false
    seen.add(message)
    return true
  })
  const text = picked
    .map((message) => `${message.role === 'user' ? '用户' : '助手'}: ${message.text}`)
    .join('\n')
  return text.length <= 8_000 ? text : text.slice(-8_000)
}

export async function readTranscript(path: string): Promise<TranscriptHit | null> {
  let info
  try {
    info = await stat(path)
  } catch {
    return null
  }
  if (!info.isFile() || info.size <= 0) return null
  let handle
  try {
    handle = await open(path, 'r')
    const length = Math.min(TAIL_BYTES, info.size)
    const start = info.size - length
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, start)
    let text = buffer.toString('utf8')
    if (start > 0) {
      const cut = text.indexOf('\n')
      if (cut >= 0) text = text.slice(cut + 1)
    }
    return {
      path,
      mtimeMs: info.mtimeMs,
      bytes: info.size,
      messages: messagesFromJsonl(text)
    }
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

export async function extractSession(session: {
  agent: string
  id: string
  path: string
}): Promise<TranscriptHit | null> {
  const path = await resolveTranscript(session)
  if (!path) return null
  return readTranscript(path)
}

/**
 * 在文件里找一句原文，返回命中附近的一小段。
 * 没命中或超时返回 null。不把整份对话留在结果里。
 */
export async function fileWindow(
  path: string,
  needle: string,
  deadlineMs: number
): Promise<string | null> {
  const query = needle.trim().toLowerCase()
  if (query.length < 2) return null
  let handle
  try {
    handle = await open(path, 'r')
    const info = await handle.stat()
    const buffer = Buffer.alloc(64 * 1024)
    let position = 0
    let carry = ''
    while (position < info.size) {
      if (Date.now() > deadlineMs) return null
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
      if (bytesRead === 0) break
      position += bytesRead
      const chunk = carry + buffer.subarray(0, bytesRead).toString('utf8')
      const idx = chunk.toLowerCase().indexOf(query)
      if (idx >= 0) {
        const start = Math.max(0, idx - 400)
        const slice = chunk.slice(start, idx + query.length + 400)
        return (start > 0 ? `…${slice}` : slice).slice(0, 1_200)
      }
      carry = chunk.slice(-Math.max(64, query.length * 2))
    }
    return null
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/** 在文件里找一句原文。命中就停，不把整份对话读进结果。 */
export async function fileContains(
  path: string,
  needle: string,
  deadlineMs: number
): Promise<boolean> {
  return (await fileWindow(path, needle, deadlineMs)) !== null
}
