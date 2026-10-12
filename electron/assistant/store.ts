/**
 * AI 助手模型配置：`<userData>/assistant-model.json`。
 *
 * 单独一个文件而不是塞进 main-prefs，因为 apiKey 的敏感级别和界面偏好
 * 完全不同：这文件只进主进程内存，IPC 永远只回掩码。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AssistantConfigInput, AssistantConfigStatus } from '../../shared/assistant'

const FILE_NAME = 'assistant-model.json'

interface StoredConfig extends AssistantConfigInput {
  /** 未来的字段演进用。 */
  version: 1
}

export interface AssistantConfig {
  baseURL: string
  apiKey: string
  model: string
  enabled: boolean
  digestEnabled: boolean
  messageSearchEnabled: boolean
}

const DEFAULTS: AssistantConfig = {
  baseURL: '',
  apiKey: '',
  model: '',
  enabled: false,
  digestEnabled: false,
  messageSearchEnabled: false
}

function filePath(userDataDir: string): string {
  return join(userDataDir, FILE_NAME)
}

function isValid(value: unknown): value is StoredConfig {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record['baseURL'] === 'string' &&
    typeof record['apiKey'] === 'string' &&
    typeof record['model'] === 'string' &&
    typeof record['enabled'] === 'boolean'
  )
}

export function loadAssistantConfig(userDataDir: string): AssistantConfig {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath(userDataDir), 'utf8'))
    if (!isValid(parsed)) return { ...DEFAULTS }
    return {
      baseURL: parsed.baseURL.trim(),
      apiKey: parsed.apiKey,
      model: parsed.model.trim(),
      enabled: parsed.enabled,
      digestEnabled: parsed.digestEnabled === true,
      messageSearchEnabled: parsed.messageSearchEnabled === true
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveAssistantConfig(
  userDataDir: string,
  update: AssistantConfigInput
): AssistantConfig {
  const current = loadAssistantConfig(userDataDir)
  // apiKey 传空 = 保留现有 key（编辑其它字段时不用重贴密钥）。
  const apiKey = update.apiKey.trim() !== '' ? update.apiKey.trim() : current.apiKey
  const next: AssistantConfig = {
    baseURL: update.baseURL.trim().replace(/\/+$/, ''),
    apiKey,
    model: update.model.trim(),
    enabled: update.enabled,
    digestEnabled:
      typeof update.digestEnabled === 'boolean' ? update.digestEnabled : current.digestEnabled,
    messageSearchEnabled:
      typeof update.messageSearchEnabled === 'boolean'
        ? update.messageSearchEnabled
        : current.messageSearchEnabled
  }
  const stored: StoredConfig = { ...next, version: 1 }
  writeFileSync(filePath(userDataDir), JSON.stringify(stored, null, 2), 'utf8')
  return next
}

export function describeConfig(config: AssistantConfig): AssistantConfigStatus {
  const masked = config.apiKey
    ? `${config.apiKey.slice(0, 3)}***${config.apiKey.slice(-4)}`
    : null
  return {
    baseURL: config.baseURL,
    model: config.model,
    enabled: config.enabled,
    digestEnabled: config.digestEnabled,
    messageSearchEnabled: config.messageSearchEnabled,
    hasApiKey: config.apiKey !== '',
    apiKeyMasked: masked
  }
}

/** 端点三项齐全即可写概要。不要求「启用 AI 查找」同时打开。 */
export function hasEndpoint(config: AssistantConfig): boolean {
  return config.baseURL !== '' && config.apiKey !== '' && config.model !== ''
}

export function isConfigured(config: AssistantConfig): boolean {
  return config.enabled && config.baseURL !== '' && config.apiKey !== '' && config.model !== ''
}
