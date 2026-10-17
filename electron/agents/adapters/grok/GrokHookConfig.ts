import { Buffer } from 'node:buffer'
import { GROK_HOOK_FILE_NAME } from './types'

export type GrokHookPlatform = 'windows' | 'posix'

const EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionDenied',
  'Stop',
  'StopFailure',
  'StopCancelled',
  'SubagentStart',
  'SubagentStop'
] as const

const POSIX_COMMAND =
  'if [ -n "${ASC_GROK_HOOK_BRIDGE:-}" ] && [ -f "$ASC_GROK_HOOK_BRIDGE" ]; then /bin/sh "$ASC_GROK_HOOK_BRIDGE" >/dev/null 2>&1 || :; fi'
/** Windows 侧只写裸文件名：grok 会取同目录下的该文件直接启动，不经 pwsh（见 README 说明）。 */
export const GROK_HOOK_SHIM_FILE_NAME = 'asc-grok-hook.cmd'
const WINDOWS_COMMAND = GROK_HOOK_SHIM_FILE_NAME

export function grokWindowsHookCommand(): string {
  return WINDOWS_COMMAND
}

export function grokPosixHookCommand(): string {
  return POSIX_COMMAND
}

function handler(platform: GrokHookPlatform): {
  type: 'command'
  command: string
  timeout: number
} {
  return {
    type: 'command',
    command: platform === 'windows' ? WINDOWS_COMMAND : POSIX_COMMAND,
    timeout: 3
  }
}

export function buildGrokManagedHookFile(platform: GrokHookPlatform): string {
  const command = handler(platform)
  const hooks: Record<string, unknown> = {}
  for (const event of EVENTS) {
    hooks[event] = [{ hooks: [command] }]
  }
  hooks.Notification = [
    { matcher: 'permission_prompt', hooks: [command] }
  ]
  return `${JSON.stringify({ hooks }, null, 2)}\n`
}

function decodedHookCommands(serialized: string): string {
  const encoded = [
    ...serialized.matchAll(/-EncodedCommand\s+([A-Za-z0-9+/=]+)/g)
  ]
  if (encoded.length === 0) return serialized
  const decoded = encoded
    .map((match) => {
      try {
        return Buffer.from(match[1], 'base64').toString('utf16le')
      } catch {
        return ''
      }
    })
    .join('\n')
  return `${serialized}\n${decoded}`
}

export function isAscGrokHookFile(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const hooks = (value as { hooks?: unknown }).hooks
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return false
  const start = (hooks as { SessionStart?: unknown }).SessionStart
  const haystack = decodedHookCommands(JSON.stringify(start ?? ''))
  return (
    haystack.includes(GROK_HOOK_SHIM_FILE_NAME) ||
    haystack.includes('ASC_GROK_HOOK_BRIDGE') ||
    haystack.includes('ASC_GROK_HOOK_BRIDGE_WINDOWS')
  )
}

export function grokHookFileName(): string {
  return GROK_HOOK_FILE_NAME
}

/**
 * Windows 钩子垫片。放在 hook JSON 同目录、由 JSON 里的裸文件名引用，
 * grok 会直接启动它（父进程是 grok 本身），因此不再为每个事件付
 * 一次 pwsh + 一次 powershell 的启动开销。
 *
 * - 非 ASC 会话：环境变量缺失，一个 if 就退出（~30ms，无解释器）。
 * - ASC 会话：curl 把事件 POST 到本机 loopback HookIngress（-m 1 硬超时，
 *   单进程、无子进程，不会留下孤儿树）。
 * - 没有 curl 或 POST 失败：退回原有 PowerShell 桥写 drop 文件。
 */
export function grokWindowsHookShimScript(): string {
  return [
    '@echo off',
    'if not defined ASC_GROK_HOOK_BRIDGE_WINDOWS exit /b 0',
    'if defined ASC_GROK_HOOK_URL (',
    '  curl.exe -s -m 1 --noproxy "*" -H "Content-Type: application/json" --data-binary @- "%ASC_GROK_HOOK_URL%" >nul 2>&1',
    '  if not errorlevel 1 exit /b 0',
    ')',
    'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%ASC_GROK_HOOK_BRIDGE_WINDOWS%"',
    'exit /b 0',
    ''
  ].join('\r\n')
}

export function grokWindowsBridgeScript(): string {
  return `$ErrorActionPreference = 'Stop'
$budgetMs = 1500
try {
  $drop = $env:ASC_GROK_HOOK_DROP
  if ([string]::IsNullOrWhiteSpace($drop) -or -not [IO.Directory]::Exists($drop)) { exit 0 }
  $lockPath = [IO.Path]::Combine($drop, '.asc-grok.lock')
  try {
    $lock = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  } catch {
    try { $age = [DateTime]::UtcNow - [IO.File]::GetCreationTimeUtc($lockPath) } catch { exit 0 }
    if ($age.TotalMilliseconds -lt 3000) { exit 0 }
    try { [IO.File]::Delete($lockPath) } catch { exit 0 }
    try {
      $lock = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    } catch { exit 0 }
  }
  $deadline = [DateTime]::UtcNow.AddMilliseconds($budgetMs)
  $inputStream = [Console]::OpenStandardInput()
  $memory = [IO.MemoryStream]::new()
  $buffer = [byte[]]::new(8192)
  while ($true) {
    $remaining = [int][Math]::Max(1, ($deadline - [DateTime]::UtcNow).TotalMilliseconds)
    $task = $inputStream.ReadAsync($buffer, 0, $buffer.Length)
    if (-not $task.Wait($remaining)) { break }
    $read = $task.Result
    if ($read -le 0) { break }
    $memory.Write($buffer, 0, $read)
    if ($memory.Length -gt 1048576) { $memory.SetLength(0); break }
    if ([DateTime]::UtcNow -gt $deadline) { break }
  }
  if ($memory.Length -le 0) { exit 0 }
  $nonce = [IO.Path]::GetRandomFileName()
  $temp = [IO.Path]::Combine($drop, ".$nonce.partial")
  $final = [IO.Path]::Combine($drop, "$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()).$PID.$nonce.json")
  [IO.File]::WriteAllBytes($temp, $memory.ToArray())
  [IO.File]::Move($temp, $final)
} catch {
  exit 0
} finally {
  if ($lock) { $lock.Dispose() }
  if ($lockPath) { try { [IO.File]::Delete($lockPath) } catch {} }
}
exit 0
`
}

export function grokPosixBridgeScript(): string {
  return `#!/bin/sh
set -eu
umask 077
drop="\${ASC_GROK_HOOK_DROP:-}"
[ -n "$drop" ] && [ -d "$drop" ] || exit 0
tmp="$(mktemp "$drop/.asc-grok.XXXXXX.partial")" || exit 0
trap 'rm -f "$tmp"' EXIT HUP INT TERM
dd bs=1048577 count=1 of="$tmp" 2>/dev/null || true
size="$(wc -c < "$tmp" | tr -d ' ')"
[ "$size" -gt 0 ] || exit 0
[ "$size" -le 1048576 ] || exit 0
final="$drop/$(date +%s).$$.$(basename "$tmp" .partial).json"
mv "$tmp" "$final"
trap - EXIT HUP INT TERM
exit 0
`
}
