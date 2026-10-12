/**
 * 这台电脑在飞书里的身份。
 *
 * 多台电脑共用一个机器人时，飞书那边只能看见「谁发了消息」，看不见消息
 * 落到了哪台长连接上。所以每台电脑自己记一个稳定 id 和一个给人看的名字：
 * id 不变（改名、重装用户数据目录之外都不该换），名字用来在对话里点名。
 *
 * 落盘：`<userData>/feishu-computer.json`。这里没有 App Secret，但仍然
 * 原子写 —— 半截 JSON 会被当成「没有身份」重新生成，两台逻辑电脑就分叉了。
 */

import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface FeishuComputer {
  id: string
  name: string
}

const FILE_VERSION = 1
const NAME_MAX = 32

type ComputerFile = {
  version: 1
  id: string
  name: string
}

export function computerFilePath(userDataDir: string): string {
  return join(userDataDir, 'feishu-computer.json')
}

/** 给人看的电脑名：去掉首尾空白，中间连续空白收成一个空格，最长 32。 */
export function normalizeComputerName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()
  const base = cleaned || fallback.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()
  const name = (base || '这台电脑').slice(0, NAME_MAX).trim()
  return name || '这台电脑'
}

function parseComputer(raw: unknown, fallbackName: string): FeishuComputer | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<ComputerFile>
  if (typeof value.id !== 'string' || !/^[0-9a-fA-F-]{16,64}$/.test(value.id)) return null
  if (typeof value.name !== 'string') return null
  return { id: value.id, name: normalizeComputerName(value.name, fallbackName) }
}

export async function loadOrCreateComputer(
  filePath: string,
  fallbackName: string
): Promise<FeishuComputer> {
  const fallback = normalizeComputerName('', fallbackName)
  try {
    const text = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(text) as Partial<ComputerFile>
    const computer = parseComputer(parsed, fallback)
    if (computer) return computer
  } catch {
    // 没有文件、半截 JSON、字段坏了：下面新建。这个方向是安全的。
  }
  const created: FeishuComputer = { id: randomUUID(), name: fallback }
  await saveComputer(filePath, created)
  return created
}

export async function saveComputerName(
  filePath: string,
  name: string,
  fallbackName: string
): Promise<FeishuComputer> {
  const current = await loadOrCreateComputer(filePath, fallbackName)
  const next: FeishuComputer = {
    id: current.id,
    name: normalizeComputerName(name, current.name)
  }
  await saveComputer(filePath, next)
  return next
}

async function saveComputer(filePath: string, computer: FeishuComputer): Promise<void> {
  const payload: ComputerFile = { version: FILE_VERSION, id: computer.id, name: computer.name }
  await mkdir(dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await chmod(tmp, 0o600).catch(() => {})
  try {
    await rename(tmp, filePath)
  } catch (error) {
    await unlink(tmp).catch(() => {})
    throw error
  }
}
