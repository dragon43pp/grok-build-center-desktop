/**
 * 重进前核对 CLI 自己的对话文件还在不在。
 *
 * 只读，不写各家目录。找不到就不要按钥匙拉起，否则会静默开成另一场。
 */
import { join } from 'node:path'
import { exists, listDir, listSubdirs } from './fsUtil'
import {
  antigravityCliHome,
  claudeConfigDir,
  codexHome,
  grokHome,
  kimiCodeHome,
  opencodeDataDir,
  piSessionDir
} from './paths'

export type ConversationProbeResult =
  | { ok: true }
  | { ok: false; reason: 'missing-key' | 'missing-file' | 'unknown-agent' }

export async function probeConversationFile(
  agentId: string,
  sessionKey: string | null
): Promise<ConversationProbeResult> {
  const key = sessionKey?.trim()
  if (!key || key.includes('..') || key.includes('/') || key.includes('\\')) {
    return { ok: false, reason: 'missing-key' }
  }
  switch (agentId) {
    case 'claude':
    case 'claude-code':
      return found(await claudeFile(key))
    case 'grok':
      return found(await nestedSession(grokHome(), 'sessions', key, 'summary.json'))
    case 'codex':
      return found(await codexRollout(key))
    case 'pi':
      return found(await piFile(key))
    case 'kimi':
      return found(await nestedSession(kimiCodeHome(), 'sessions', key, 'session.json'))
    case 'opencode':
      return found(await exists(join(opencodeDataDir(), 'opencode.db')))
    case 'agy':
    case 'antigravity':
      return found(
        await exists(join(antigravityCliHome(), 'conversations', `${key}.db`))
      )
    default:
      return { ok: false, reason: 'unknown-agent' }
  }
}

async function claudeFile(key: string): Promise<boolean> {
  const projects = join(claudeConfigDir(), 'projects')
  for (const slug of await listDir(projects)) {
    if (await exists(join(projects, slug, `${key}.jsonl`))) return true
  }
  return false
}

async function codexRollout(key: string): Promise<boolean> {
  const root = join(codexHome(), 'sessions')
  for (const year of await listSubdirs(root)) {
    for (const month of await listSubdirs(join(root, year))) {
      for (const day of await listSubdirs(join(root, year, month))) {
        const dir = join(root, year, month, day)
        for (const file of await listDir(dir)) {
          if (file.includes(key) && file.endsWith('.jsonl')) return true
        }
      }
    }
  }
  return false
}

async function piFile(key: string): Promise<boolean> {
  const root = await piSessionDir()
  for (const dir of await listSubdirs(root)) {
    if (await exists(join(root, dir, `${key}.jsonl`))) return true
  }
  return exists(join(root, `${key}.jsonl`))
}

async function nestedSession(
  home: string,
  sessionsDir: string,
  key: string,
  marker: string
): Promise<boolean> {
  const root = join(home, sessionsDir)
  for (const cwdDir of await listSubdirs(root)) {
    if (await exists(join(root, cwdDir, key, marker))) return true
  }
  return false
}

function found(ok: boolean): ConversationProbeResult {
  return ok ? { ok: true } : { ok: false, reason: 'missing-file' }
}
