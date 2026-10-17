import { basename, isAbsolute, resolve } from 'node:path'

const MAX_LABEL = 64

export function sanitizeCodexLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_LABEL)
  return clean || undefined
}

function commandName(command: unknown): string | undefined {
  if (typeof command !== 'string') return undefined
  const first = command.trim().match(/^(?:["']([^"']+)["']|(\S+))/)
  const raw = first?.[1] ?? first?.[2]
  if (!raw || raw.includes('$') || raw.includes('%')) return undefined
  return sanitizeCodexLabel(basename(raw.replaceAll('\\', '/')))
}

const WRITE_TOOLS = ['apply_patch', 'write_file', 'edit_file', 'write', 'edit']

/**
 * 写入类工具的目标绝对路径。只服务检查点记录层：相对路径按 cwd 补全，
 * 补不出绝对路径就返回 undefined（记录层拒绝，不猜）。
 */
export function codexWritePath(
  toolNameValue: unknown,
  toolInput: Record<string, unknown>,
  cwd?: string
): string | undefined {
  const toolName = sanitizeCodexLabel(toolNameValue)?.toLowerCase()
  if (!toolName || !WRITE_TOOLS.includes(toolName)) return undefined
  const raw = pathField(toolInput.file_path ?? toolInput.path ?? toolInput.filePath)
  if (!raw) return undefined
  try {
    if (isAbsolute(raw)) return resolve(raw)
    if (!cwd) return undefined
    return resolve(resolve(cwd), raw)
  } catch {
    return undefined
  }
}

function pathField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return clean || undefined
}

export function summarizeCodexTool(
  toolNameValue: unknown,
  toolInput: Record<string, unknown>
): { toolName: string; summary?: string } {
  const toolName = sanitizeCodexLabel(toolNameValue) ?? 'Tool'
  if (toolName.toLowerCase() === 'bash') {
    return { toolName, summary: commandName(toolInput.command) }
  }
  return { toolName }
}
