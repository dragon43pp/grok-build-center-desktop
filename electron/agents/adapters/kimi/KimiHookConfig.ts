export type KimiHookPlatform = 'windows' | 'posix'

export type KimiManagedHookMerge =
  | { ok: true; changed: boolean; content: string }
  | { ok: false; reason: 'kimi-config-marker-conflict' }

const MANAGED_START = '# >>> asc:kimi-observer:v1'
const MANAGED_END = '# <<< asc:kimi-observer:v1'

const EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionResult',
  'Stop',
  'StopFailure',
  'Interrupt',
  'SubagentStart',
  'SubagentStop'
] as const

const POSIX_COMMAND =
  'if [ -n "${ASC_KIMI_HOOK_BRIDGE:-}" ] && [ -f "$ASC_KIMI_HOOK_BRIDGE" ]; then /bin/sh "$ASC_KIMI_HOOK_BRIDGE" >/dev/null 2>&1 || :; fi'
const LEGACY_WINDOWS_COMMAND =
  'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "if ($env:ASC_KIMI_HOOK_BRIDGE_WINDOWS -and (Test-Path -LiteralPath $env:ASC_KIMI_HOOK_BRIDGE_WINDOWS -PathType Leaf)) { & $env:ASC_KIMI_HOOK_BRIDGE_WINDOWS }; exit 0"'

/** Windows 钩子垫片文件名；与 Kimi 配置同目录，用绝对路径引用。 */
export const KIMI_HOOK_SHIM_FILE_NAME = 'asc-kimi-hook.cmd'

function lineEnding(source: string): '\r\n' | '\n' {
  return source.includes('\r\n') ? '\r\n' : '\n'
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

interface ManagedMarker {
  offset: number
  length: number
  owner: 'asc' | 'vibing'
  version: string
}

function managedMarkers(
  source: string,
  boundary: 'start' | 'end'
): ManagedMarker[] {
  const pattern =
    boundary === 'start'
      ? /(^|\n)(# >>> (asc|vibing):kimi-observer:v([0-9]+))(?=\r?\n|$)/g
      : /(^|\n)(# <<< (asc|vibing):kimi-observer:v([0-9]+))(?=\r?\n|$)/g
  const markers: ManagedMarker[] = []
  for (const match of source.matchAll(pattern)) {
    markers.push({
      offset: match.index + match[1].length,
      length: match[2].length,
      owner: match[3] as ManagedMarker['owner'],
      version: match[4]
    })
  }
  return markers
}

export function buildKimiManagedHookBlock(
  platform: KimiHookPlatform,
  eol: '\r\n' | '\n' = '\n',
  windowsCommand: string = LEGACY_WINDOWS_COMMAND
): string {
  const command = platform === 'windows' ? windowsCommand : POSIX_COMMAND
  const hooks = EVENTS.map((event) =>
    [
      '[[hooks]]',
      `event = ${tomlString(event)}`,
      `command = ${tomlString(command)}`,
      'timeout = 3'
    ].join(eol)
  ).join(`${eol}${eol}`)
  return [MANAGED_START, hooks, MANAGED_END].join(eol)
}

/**
 * Windows 钩子垫片（绝对路径，与 Kimi 配置同目录）。
 * 非 ASC 会话第一行就退出，ASC 会话内用 curl 把事件 POST 到 loopback
 * HookIngress（-m 1 硬超时、单进程无子进程），curl 缺失时退回 PowerShell 桥。
 */
export function kimiWindowsHookShimScript(): string {
  return [
    '@echo off',
    'if not defined ASC_KIMI_HOOK_BRIDGE_WINDOWS exit /b 0',
    'if defined ASC_KIMI_HOOK_URL (',
    '  curl.exe -s -m 1 --noproxy "*" -H "Content-Type: application/json" --data-binary @- "%ASC_KIMI_HOOK_URL%" >nul 2>&1',
    '  if not errorlevel 1 exit /b 0',
    ')',
    'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%ASC_KIMI_HOOK_BRIDGE_WINDOWS%"',
    'exit /b 0',
    ''
  ].join('\r\n')
}

export function kimiWindowsBridgeScript(): string {
  return `$ErrorActionPreference = 'Stop'
$budgetMs = 1500
try {
  $drop = $env:ASC_KIMI_HOOK_DROP
  if ([string]::IsNullOrWhiteSpace($drop) -or -not [IO.Directory]::Exists($drop)) { exit 0 }
  $lockPath = [IO.Path]::Combine($drop, '.asc-kimi.lock')
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

export function kimiPosixBridgeScript(): string {
  return `#!/bin/sh
set -eu
umask 077
drop="\${ASC_KIMI_HOOK_DROP:-}"
[ -n "$drop" ] && [ -d "$drop" ] || exit 0
tmp="$(mktemp "$drop/.asc-kimi.XXXXXX.partial")" || exit 0
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

export function mergeKimiManagedHooks(
  source: string,
  platform: KimiHookPlatform,
  windowsCommand?: string
): KimiManagedHookMerge {
  const eol = lineEnding(source)
  const block = buildKimiManagedHookBlock(platform, eol, windowsCommand)
  const starts = managedMarkers(source, 'start')
  const ends = managedMarkers(source, 'end')
  if (starts.length > 0 || ends.length > 0) {
    if (
      starts.length !== 1 ||
      ends.length !== 1 ||
      starts[0].owner !== ends[0].owner ||
      starts[0].version !== ends[0].version ||
      starts[0].offset >= ends[0].offset
    ) {
      return { ok: false, reason: 'kimi-config-marker-conflict' }
    }
    const content =
      source.slice(0, starts[0].offset) +
      block +
      source.slice(ends[0].offset + ends[0].length)
    return { ok: true, changed: content !== source, content }
  }
  if (source.length === 0) {
    return { ok: true, changed: true, content: `${block}${eol}` }
  }
  const separator = source.endsWith(`${eol}${eol}`)
    ? ''
    : source.endsWith(eol)
      ? eol
      : `${eol}${eol}`
  return {
    ok: true,
    changed: true,
    content: `${source}${separator}${block}${eol}`
  }
}
