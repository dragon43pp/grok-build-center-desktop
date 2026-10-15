/**
 * 会话账本与启动钥匙提取的纯检查。不碰用户的 CLI 目录。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractAgentSessionKey } from '../shared/session-ledger'
import { SessionLedger } from '../electron/sessions/SessionLedger'

let failed = 0
function check(name: string, ok: boolean): void {
  if (ok) {
    console.log(`ok  ${name}`)
    return
  }
  failed += 1
  console.error(`FAIL ${name}`)
}

check(
  'claude --resume 取到 id',
  extractAgentSessionKey('claude', ['--resume', 'ses_abc']) === 'ses_abc'
)
check(
  'codex resume 子命令取到 id',
  extractAgentSessionKey('codex', ['resume', 'thread_1']) === 'thread_1'
)
check(
  '新开会话没有钥匙',
  extractAgentSessionKey('claude', ['--model', 'sonnet']) === null
)
check(
  '不把下一个旗当成钥匙',
  extractAgentSessionKey('grok', ['--resume', '--model']) === null
)

const dir = mkdtempSync(join(tmpdir(), 'asc-ledger-'))
try {
  const ledger = new SessionLedger(dir)
  ledger.upsertRunning({
    id: 'asc-1',
    agentId: 'claude',
    installationId: 'claude-local',
    name: '改会话账本',
    cwd: 'D:\\agent-session-center',
    args: ['--resume', 'ses_abc'],
    cols: 120,
    rows: 40,
    agentSessionKey: 'ses_abc'
  })
  ledger.captureKey('asc-1', 'should-not-replace')
  check('已有钥匙不被空捕获覆盖', ledger.get('asc-1')?.agentSessionKey === 'ses_abc')

  ledger.markStatus('asc-1', 'stopped', true)
  check('退出后打上重进标记', ledger.listResumeOnLaunch().length === 1)
  ledger.clearResume('asc-1')
  check('文件接不上后清掉重进标记', ledger.listResumeOnLaunch().length === 0)
  ledger.upsertRunning({
    id: 'asc-1',
    agentId: 'claude',
    installationId: 'claude-local',
    name: '改会话账本',
    cwd: 'D:\\agent-session-center',
    args: ['--resume', 'ses_abc'],
    cols: 120,
    rows: 40,
    agentSessionKey: 'ses_abc'
  })
  ledger.markStatus('asc-1', 'stopped', true)

  ledger.upsertRunning({
    id: 'asc-3',
    agentId: 'claude',
    installationId: 'claude-local',
    name: '重进同一场',
    cwd: 'D:\\agent-session-center',
    args: ['--resume', 'ses_abc'],
    cols: 120,
    rows: 40,
    agentSessionKey: 'ses_abc'
  })
  check('同一把钥匙重新拉起后，旧行不再提示重进', ledger.listResumeOnLaunch().every((row) => row.id !== 'asc-1'))

  ledger.upsertRunning({
    id: 'asc-2',
    agentId: 'agy',
    installationId: 'agy-local',
    name: '等第一条消息',
    cwd: 'D:\\work',
    args: [],
    cols: 80,
    rows: 24
  })
  check('崩溃前还在跑的行会被降级', ledger.demoteStaleRunning() === 2)
  check('降级行进入重进名单', ledger.listResumeOnLaunch().some((row) => row.id === 'asc-2'))
  check('主动停止的行不被降级成崩溃', ledger.get('asc-1')?.status === 'stopped')
  ledger.close()

  const brokenDir = mkdtempSync(join(tmpdir(), 'asc-ledger-broken-'))
  writeFileSync(join(brokenDir, 'session-ledger.sqlite'), 'not a database')
  let threw = false
  try {
    new SessionLedger(brokenDir).close()
  } catch {
    threw = true
  }
  check('坏账本不会假装打开', threw)
  try {
    rmSync(brokenDir, { recursive: true, force: true })
  } catch {
    // Windows 上损坏库的句柄要等进程退出才放。检查本身已经结束。
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (failed > 0) {
  console.error(`${failed} checks failed`)
  process.exit(1)
}
console.log('session ledger checks passed')
