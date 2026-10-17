import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  GROK_HOOK_SHIM_FILE_NAME,
  buildGrokManagedHookFile,
  grokHookFileName,
  grokWindowsHookShimScript,
  isAscGrokHookFile,
  type GrokHookPlatform
} from './GrokHookConfig'

export type EnsureGrokManagedHooksResult =
  | { ok: true; changed: boolean; path: string }
  | {
      ok: false
      reason:
        | 'grok-hook-path-unavailable'
        | 'grok-wsl-env-timeout'
        | 'grok-wsl-env-unavailable'
        | 'grok-home-path-invalid'
        | 'grok-hook-file-conflict'
        | 'grok-hook-write-failed'
    }

const inProcessTails = new Map<string, Promise<void>>()

async function withMutex<T>(path: string, action: () => Promise<T>): Promise<T> {
  const key = process.platform === 'win32' ? path.toLowerCase() : path
  const previous = (inProcessTails.get(key) ?? Promise.resolve()).catch(() => {})
  let release!: () => void
  const gate = new Promise<void>((resolveGate) => (release = resolveGate))
  const tail = previous.then(() => gate)
  inProcessTails.set(key, tail)
  await previous
  try {
    return await action()
  } finally {
    release()
    if (inProcessTails.get(key) === tail) inProcessTails.delete(key)
  }
}

export function grokHooksDirectory(grokHome: string): string {
  return join(grokHome, 'hooks')
}

export function grokManagedHookPath(grokHome: string): string {
  return join(grokHooksDirectory(grokHome), grokHookFileName())
}

export function grokHookShimPath(grokHome: string): string {
  return join(grokHooksDirectory(grokHome), GROK_HOOK_SHIM_FILE_NAME)
}

/**
 * Windows 钩子靠同目录的垫片文件承载实际逻辑；内容未变时不重写，
 * 避免每次 prepare 都动用户磁盘。
 */
async function ensureWindowsHookShim(grokHome: string): Promise<boolean> {
  const shimPath = grokHookShimPath(grokHome)
  const content = grokWindowsHookShimScript()
  try {
    if ((await readFile(shimPath, 'utf8')) === content) return true
  } catch {
    // 缺失或不可读时重建
  }
  const temp = join(
    grokHooksDirectory(grokHome),
    `.${GROK_HOOK_SHIM_FILE_NAME}.${randomBytes(8).toString('hex')}.tmp`
  )
  try {
    await writeFile(temp, content, { encoding: 'utf8', mode: 0o700, flag: 'wx' })
    await rename(temp, shimPath)
    return true
  } catch {
    await rm(temp, { force: true }).catch(() => {})
    return false
  }
}

export async function ensureGrokManagedHooks(options: {
  grokHome: string
  platform: GrokHookPlatform
}): Promise<EnsureGrokManagedHooksResult> {
  if (!options.grokHome || !resolve(options.grokHome)) {
    return { ok: false, reason: 'grok-hook-path-unavailable' }
  }
  const hookPath = grokManagedHookPath(options.grokHome)
  return withMutex(hookPath, async () => {
    try {
      await mkdir(grokHooksDirectory(options.grokHome), {
        recursive: true,
        mode: 0o700
      })
      let existing: string | null = null
      try {
        existing = await readFile(hookPath, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          return { ok: false, reason: 'grok-hook-write-failed' }
        }
      }
      if (existing !== null) {
        let parsed: unknown
        try {
          parsed = JSON.parse(existing) as unknown
        } catch {
          return { ok: false, reason: 'grok-hook-file-conflict' }
        }
        if (!isAscGrokHookFile(parsed)) {
          return { ok: false, reason: 'grok-hook-file-conflict' }
        }
      }
      const next = buildGrokManagedHookFile(options.platform)
      if (options.platform === 'windows' && !(await ensureWindowsHookShim(options.grokHome))) {
        return { ok: false, reason: 'grok-hook-write-failed' }
      }
      if (existing === next) return { ok: true, changed: false, path: hookPath }
      const nonce = randomBytes(8).toString('hex')
      const temp = join(
        grokHooksDirectory(options.grokHome),
        `.${grokHookFileName()}.${nonce}.tmp`
      )
      await writeFile(temp, next, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await rename(temp, hookPath)
      // 早期版本把 hook 写在旧文件名下；写入新文件后顺手清掉，避免残留在用户磁盘上
      await rm(join(grokHooksDirectory(options.grokHome), 'gbc-observer.json'), {
        force: true
      }).catch(() => {})
      return { ok: true, changed: true, path: hookPath }
    } catch {
      return { ok: false, reason: 'grok-hook-write-failed' }
    }
  })
}
