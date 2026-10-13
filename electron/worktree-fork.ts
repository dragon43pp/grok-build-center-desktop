/**
 * 「Fork 会话（连代码分叉）」的主进程实现：git worktree。
 *
 * 为什么是 worktree 而不是原地切分支：原会话可能还在跑，checkout 会搅乱它；
 * worktree 开一个**新分支 + 新目录**，两边互不干扰。分叉出来的 CLI 进程把
 * worktree 目录当工作区，代码改动天然隔离。
 *
 * v1 的边界（有意不做，别顺手加）：
 *   - 不搬未提交改动 —— worktree 从当前 HEAD 创建，stash/apply 是另一套
 *     有损操作，提示文案里明说就好；
 *   - 不做自动清理 —— 建出来的目录和分支由人在 git 里自己管；
 *   - 不做 WSL 特判 —— grok 的 cwd 理论上可能是 WSL 路径，从 Windows 侧
 *     `git -C` 尝试，失败就走错误 notice，不过度工程。
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface WorktreeForkPlan {
  /** 新 worktree 的绝对路径：`<repoRoot>-fork-<yyyymmdd-HHmmss>`。 */
  dir: string
  /** 新分支名：`asc-fork-<yyyymmdd-HHmmss>`（asc-fork- 前缀避开 basename 里的非法字符）。 */
  branch: string
}

export type ForkWorktreeResult =
  | { ok: true; dir: string; branch: string }
  | { ok: false; /** stderr 摘要，渲染层直接展示给人看。 */ reason: string }

/** `2026-10-13 15:30:45` -> `20261013-153045`（本地时间）。 */
export function worktreeTimestamp(now: Date): string {
  const pad2 = (value: number): string => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
  return `${date}-${time}`
}

/**
 * 命名规则：目录 `<repoRoot>-fork-<时间戳>`（仓库的兄弟目录），分支
 * `asc-fork-<时间戳>`。同一秒内分叉第二次时，目录已存在 —— 时间戳后加
 * `-2`、`-3` 递增；分支跟着加同一个后缀，否则 `worktree add -b` 会撞上
 * 已存在的同名分支直接失败。`dirExists` 注入而不是内部 stat，纯函数才可判卷。
 */
export function planWorktreeFork(
  repoRoot: string,
  now: Date,
  dirExists: (dir: string) => boolean = () => false
): WorktreeForkPlan {
  const stamp = worktreeTimestamp(now)
  const baseDir = `${repoRoot}-fork-${stamp}`
  // 后缀从 -2 起跳（-1 是给人看的名字里不该出现的数）：第一次冲突就是
  // `<base>-2`，第二次 `-3`，与「在时间戳后加 -2、-3 递增」的约定一致。
  let suffix = 1
  let dir = baseDir
  while (dirExists(dir)) {
    suffix += 1
    dir = `${baseDir}-${suffix}`
  }
  const branch = suffix > 1 ? `asc-fork-${stamp}-${suffix}` : `asc-fork-${stamp}`
  return { dir, branch }
}

/** stderr 往往带多行进度信息；只留最末几行有内容的部分当摘要。 */
function summariseError(error: unknown, fallback: string): string {
  const text =
    error && typeof error === 'object' && 'stderr' in error
      ? String((error as { stderr?: unknown }).stderr ?? '')
      : error instanceof Error
        ? error.message
        : String(error)
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const summary = lines.slice(-3).join(' · ')
  return summary.length > 0 ? summary.slice(0, 512) : fallback
}

/**
 * 建一个「连代码」的分叉 worktree。输入是会话 cwd：先拿仓库根（fork 目录
 * 以**仓库根**命名，跟会话在哪个子目录里跑无关），再按 planWorktreeFork
 * 起名，最后 `worktree add`。所有失败都收进 `{ ok: false, reason }`，
 * 不抛 —— 渲染层只认结果对象。
 */
export async function forkWorktree(cwd: string): Promise<ForkWorktreeResult> {
  let repoRoot: string
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', cwd, 'rev-parse', '--show-toplevel'],
      { timeout: 15_000, windowsHide: true }
    )
    repoRoot = stdout.trim()
    if (!repoRoot) return { ok: false, reason: 'git rev-parse returned an empty root' }
  } catch (error) {
    return {
      ok: false,
      reason: summariseError(error, 'not a git repository (or git is unavailable)')
    }
  }

  const { dir, branch } = planWorktreeFork(repoRoot, new Date(), existsSync)
  try {
    await execFileAsync('git', ['-C', cwd, 'worktree', 'add', dir, '-b', branch], {
      timeout: 60_000,
      windowsHide: true
    })
  } catch (error) {
    return { ok: false, reason: summariseError(error, 'git worktree add failed') }
  }
  return { ok: true, dir, branch }
}
