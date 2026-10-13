/**
 * 判卷：从一场会话分叉（--fork-session），参数到底拼得对不对？
 *
 * planFork 是纯函数，判卷不需要真会话 —— 它的风险不在「id 找不找得到」
 * （那是 planResume / verify_resume.ts 的事），而在**两张参数表会不会被改串**：
 * 有人把 SPECS 的参数顺手复制进 FORK_SPECS（分叉变原地续）、或者把没实测过的
 * agent 加进 FORK_SPECS（猜一面旗让用户点）。这份脚本盯死五类事实，任何一件
 * 不成立就 exit 1：
 *
 *   A. ok 的参数 —— 必须同时含 `--resume <id>` 和 `--fork-session`，且
 *      `--resume` 的值就是这场自己的 id。少了 fork 旗 = 静默污染原会话，
 *      比没有按钮糟得多。
 *   B. blocker —— codex 明确 `no-fork-support`（2026-10-13 实测它的 `resume`
 *      子命令没有这面旗）；未实测的 agent（opencode/kimi/pi/antigravity/
 *      workbuddy/dsh）同样 `no-fork-support`；子代理 `subagent`；空 id
 *      `no-session-id`。
 *   C. cliId 与 planResume 同源 —— 分叉走的是同一条 launchCli 链路，cliId
 *      必须对得上启动扫描里的 definition.id（claude 是 'claude'）。
 *   D. model 追加 —— 给了 model 时 `--model <m>` 追加在 fork 旗之后，
 *      复用 withModel，不该被 fork 的 base 参数挤掉。
 *   E. 预填文本可逆 —— fork 参数会预填进 NewSessionFlow 让人过一眼，
 *      `formatArgs` 摆出来的文本必须能被 `parseCommandLine` 解析回同一 argv。
 *   F. worktree 命名 —— 「连代码分叉」的目录/分支命名（planWorktreeFork）：
 *      时间戳格式、目录与分支同构、同一秒冲突时 `-2`/`-3` 递增且分支同步
 *      加后缀（否则 `worktree add -b` 会撞上同名分支直接失败）。
 *
 * 只读：不启动任何 CLI、不碰任何会话文件，纯内存判卷。
 *
 *   node tools/_verify_fork.mjs
 */
import { planFork, planResume, formatArgs } from '../shared/session-resume'
import { planWorktreeFork, worktreeTimestamp } from '../electron/worktree-fork'
import { AGENT_IDS, type AgentId, type HistorySession } from '../shared/session-history'
import { parseCommandLine } from '../src/app/launchOptions'

let failures = 0

function fail(message: string): void {
  failures += 1
  console.log(`  FAIL  ${message}`)
}

function check(condition: boolean, message: string): void {
  if (!condition) fail(message)
}

const SESSION_ID = '0199a4e2-7c31-7b02-9c4d-2f8a0b6e51d3'

// ── A. ok 的参数 ──────────────────────────────────────────────────────────
console.log('===== A. ok 的参数（--resume <id> + --fork-session）=====')
for (const agent of ['claude', 'grok'] as AgentId[]) {
  const plan = planFork({ agent, id: SESSION_ID, subagent: false })
  if (!plan.ok) {
    fail(`${agent}: 应判 ok，实际 blocker=${plan.blocker}`)
    continue
  }
  check(
    plan.args.includes('--fork-session'),
    `${agent}: 参数缺 --fork-session（${JSON.stringify(plan.args)}）—— 那是原地续，会污染原会话`
  )
  const resumeAt = plan.args.indexOf('--resume')
  check(
    resumeAt >= 0 && plan.args[resumeAt + 1] === SESSION_ID,
    `${agent}: --resume 的值不是本场 id（${JSON.stringify(plan.args)}）`
  )
  console.log(`  ok  ${pad(agent, 8)} ${JSON.stringify(plan.args)}`)

  // model 追加：fork 旗之后跟着 --model，不能被挤掉。
  const withModelPlan = planFork({ agent, id: SESSION_ID, subagent: false }, 'sonnet')
  if (!withModelPlan.ok) {
    fail(`${agent}: 带 model 也应判 ok`)
    continue
  }
  const modelAt = withModelPlan.args.indexOf('--model')
  check(
    modelAt > withModelPlan.args.indexOf('--fork-session') &&
      withModelPlan.args[modelAt + 1] === 'sonnet',
    `${agent}: --model 追加位置不对（${JSON.stringify(withModelPlan.args)}）`
  )
}

function pad(value: string, width: number): string {
  return value.padEnd(width)
}
// ── B. blocker ────────────────────────────────────────────────────────────
console.log('\n===== B. blocker（codex / 未实测 agent / 子代理 / 空 id）=====')
{
  const codex = planFork({ agent: 'codex', id: SESSION_ID, subagent: false })
  check(
    !codex.ok && codex.blocker === 'no-fork-support',
    `codex 应 no-fork-support，实际 ${JSON.stringify(codex)}`
  )
  console.log(`  ok  codex -> ${codex.ok ? 'ok?!' : codex.blocker}`)

  // 能恢复 ≠ 能分叉：codex 的 resume 必须仍然判 ok，别把两张表一起改坏。
  const codexResume = planResume({
    agent: 'codex',
    id: SESSION_ID,
    subagent: false
  } as HistorySession)
  check(codexResume.ok, 'codex 的 planResume 应保持 ok —— 分叉改动不许伤到恢复')

  const unverified = AGENT_IDS.filter(
    (agent) => agent !== 'claude' && agent !== 'grok' && agent !== 'codex'
  )
  for (const agent of unverified) {
    const plan = planFork({ agent, id: SESSION_ID, subagent: false })
    check(
      !plan.ok && plan.blocker === 'no-fork-support',
      `${agent} 应 no-fork-support（未实测），实际 ${JSON.stringify(plan)}`
    )
  }
  console.log(`  ok  未实测 agent ×${unverified.length} 全部 no-fork-support`)

  const subagent = planFork({ agent: 'claude', id: SESSION_ID, subagent: true })
  check(
    !subagent.ok && subagent.blocker === 'subagent',
    `子代理应 subagent，实际 ${JSON.stringify(subagent)}`
  )
  console.log(`  ok  subagent -> ${subagent.ok ? 'ok?!' : subagent.blocker}`)

  const noId = planFork({ agent: 'claude', id: '   ', subagent: false })
  check(
    !noId.ok && noId.blocker === 'no-session-id',
    `空 id 应 no-session-id，实际 ${JSON.stringify(noId)}`
  )
  console.log(`  ok  空 id -> ${noId.ok ? 'ok?!' : noId.blocker}`)
}

// ── C. cliId 与 planResume 同源 ───────────────────────────────────────────
console.log('\n===== C. cliId 同源（分叉走 launchCli 同一条链路）=====')
for (const agent of ['claude', 'grok'] as AgentId[]) {
  const fork = planFork({ agent, id: SESSION_ID, subagent: false })
  const resume = planResume({ agent, id: SESSION_ID, subagent: false } as HistorySession)
  if (!fork.ok || !resume.ok) {
    fail(`${agent}: 两条计划都应 ok`)
    continue
  }
  check(fork.cliId === resume.cliId, `${agent}: cliId 不一致 ${fork.cliId} != ${resume.cliId}`)
  console.log(`  ok  ${pad(agent, 8)} cliId=${fork.cliId}`)
}

// ── D. 完整 HistorySession 也能直接传 ─────────────────────────────────────
console.log('\n===== D. 参数兼容（完整 HistorySession 可直接传入）=====')
{
  const full: HistorySession = {
    agent: 'claude',
    id: SESSION_ID,
    title: 'whatever',
    cwd: 'C:\\some\\dir',
    createdAt: null,
    updatedAt: null,
    messageCount: 0,
    model: '',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      total: 0
    },
    costUsd: 0,
    costSource: 'none',
    storage: 'file',
    path: '',
    archived: false,
    subagent: false
  }
  const plan = planFork(full)
  check(plan.ok, '完整 HistorySession 传入 planFork 应 ok')
  console.log(`  ok  ${plan.ok ? JSON.stringify(plan.args) : plan.blocker}`)
}

// ── E. 预填文本可逆 ───────────────────────────────────────────────────────
console.log('\n===== E. formatArgs 往返 =====')
{
  const argv = ['--resume', SESSION_ID, '--fork-session', '--model', 'sonnet']
  const text = formatArgs(argv)
  const back = parseCommandLine(text)
  const same = back.length === argv.length && back.every((token, i) => token === argv[i])
  console.log(`  ${same ? 'ok  ' : 'FAIL'}  ${JSON.stringify(argv)} -> "${text}" -> ${JSON.stringify(back)}`)
  check(same, 'fork 预填文本不可逆')
}

// ── F. worktree 命名（planWorktreeFork）──────────────────────────────────
console.log('\n===== F. worktree 命名（连代码分叉）=====')
{
  // 2026-10-13 15:30:45 本地时间
  const now = new Date(2026, 9, 13, 15, 30, 45)
  const stamp = worktreeTimestamp(now)
  check(/^\d{8}-\d{6}$/.test(stamp), `时间戳格式不对：${stamp}（要 yyyymmdd-HHmmss）`)
  console.log(`  ok  时间戳 ${stamp}`)

  const plan = planWorktreeFork('C:/code/my-repo', now)
  check(
    plan.dir === `C:/code/my-repo-fork-${stamp}`,
    `目录命名不对：${plan.dir}`
  )
  check(
    plan.branch === `asc-fork-${stamp}`,
    `分支命名不对：${plan.branch}`
  )
  console.log(`  ok  ${plan.dir} + ${plan.branch}`)

  // 同一秒第二次分叉：目录被占 → -2；分支同步加后缀，否则 worktree add -b
  // 撞同名分支直接失败。
  const twice = planWorktreeFork('C:/code/my-repo', now, (dir) =>
    dir === `C:/code/my-repo-fork-${stamp}`
  )
  check(
    twice.dir === `C:/code/my-repo-fork-${stamp}-2`,
    `目录冲突没递增到 -2：${twice.dir}`
  )
  check(
    twice.branch === `asc-fork-${stamp}-2`,
    `分支没跟着目录加 -2 后缀：${twice.branch}`
  )
  console.log(`  ok  冲突一次 -> ${twice.dir} + ${twice.branch}`)

  const thrice = planWorktreeFork(
    'C:/code/my-repo',
    now,
    (dir) =>
      dir === `C:/code/my-repo-fork-${stamp}` ||
      dir === `C:/code/my-repo-fork-${stamp}-2`
  )
  check(
    thrice.dir === `C:/code/my-repo-fork-${stamp}-3` &&
      thrice.branch === `asc-fork-${stamp}-3`,
    `冲突两次没递增到 -3：${JSON.stringify(thrice)}`
  )
  console.log(`  ok  冲突两次 -> ${thrice.dir} + ${thrice.branch}`)

  // 干净路径（不冲突）绝不该带后缀。
  const clean = planWorktreeFork('C:/code/my-repo', now, () => false)
  check(
    !clean.dir.endsWith('-2') && !clean.branch.endsWith('-2'),
    '无冲突时不该有后缀'
  )
}

// ── 收尾 ──────────────────────────────────────────────────────────────────
console.log('\n===== 结论 =====')
if (failures === 0) {
  console.log('全部通过 · 未启动任何 CLI、未写入任何会话')
} else {
  console.log(`${failures} 项失败 —— 不要发这个版本`)
}
process.exit(failures === 0 ? 0 : 1)
