/**
 * 会话账本与启动钥匙提取的纯检查。不碰用户的 CLI 目录。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractAgentSessionKey } from '../shared/session-ledger'
import { SessionLedger } from '../electron/sessions/SessionLedger'
import { parseProjectFile, renderProjectFile, appendProgress } from '../shared/project-file'
import { ProjectStore } from '../electron/sessions/ProjectStore'

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
  check('还在跑且已有钥匙的行也进入重进名单', ledger.listResumeOnLaunch().some((row) => row.id === 'asc-3'))

  ledger.upsertRunning({
    id: 'asc-2',
    agentId: 'agy',
    installationId: 'agy-local',
    name: '等第一条消息',
    cwd: 'D:\\work',
    args: [],
    cols: 80,
    rows: 24,
    agentSessionKey: 'agy-key'
  })
  ledger.upsertRunning({
    id: 'asc-4',
    agentId: 'grok',
    installationId: 'grok-local',
    name: '安装打断',
    cwd: 'D:\\work',
    args: ['--resume', '01a-key'],
    cols: 80,
    rows: 24,
    agentSessionKey: '01a-key'
  })
  ledger.upsertRunning({
    id: 'asc-5',
    agentId: 'grok',
    installationId: 'grok-local',
    name: '还没钥匙',
    cwd: 'D:\\work',
    args: [],
    cols: 80,
    rows: 24
  })
  check('安装打断且有钥匙的行补进重进名单', ledger.repairInterrupted() === 4)
  check('没挂宿主的有钥匙行可以重进', ledger.listResumeOnLaunch().some((row) => row.id === 'asc-4'))
  check('没钥匙的打断行不再假装在跑', ledger.get('asc-5')?.status === 'stopped')
  check('挂着宿主、还在跑的行会被降级', ledger.demoteStaleRunning() === 0)
  ledger.upsertRunning({
    id: 'asc-6',
    agentId: 'grok',
    installationId: 'grok-local',
    name: '宿主还记着',
    cwd: 'D:\\work',
    args: [],
    cols: 80,
    rows: 24,
    hostPtyId: 'pty-live'
  })
  check('崩溃前还在跑的行会被降级', ledger.demoteStaleRunning() === 1)
  check('有钥匙的降级行进入重进名单', ledger.listResumeOnLaunch().some((row) => row.id === 'asc-2'))
  check('主动停止的行不被降级成崩溃', ledger.get('asc-1')?.status === 'stopped')
  ledger.renameSession('asc-3', '改过的名字')
  check('改名写进当前这场', ledger.get('asc-3')?.name === '改过的名字')
  check('有钥匙的改名写进名字表', ledger.lookupName('claude', 'ses_abc') === '改过的名字')
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

const project = parseProjectFile(renderProjectFile({ goal: '把前端做完', progress: '', rest: '' }))
check('项目文件保留人写的目标', project.goal === '把前端做完')
const noted = appendProgress(project, '交给 Antigravity：做登录页')
check('进展补在目标后面', noted.progress.includes('登录页') && noted.goal === '把前端做完')

const notesDir = mkdtempSync(join(tmpdir(), 'asc-notes-'))
const repoDir = mkdtempSync(join(tmpdir(), 'asc-repo-'))
try {
  writeFileSync(join(repoDir, 'PROJECT.md'), renderProjectFile({ goal: '旧目标', progress: '旧进展', rest: '' }), 'utf8')
  writeFileSync(join(repoDir, 'AGENTS.md'), '用 pnpm\n', 'utf8')
  const store = new ProjectStore(notesDir)
  const emptyRepo = mkdtempSync(join(tmpdir(), 'asc-empty-repo-'))
  const created = store.create('本地项目', emptyRepo)
  check('新建不往仓库写 PROJECT.md', !existsSync(join(emptyRepo, 'PROJECT.md')))
  store.note(created.id, '交给审查')
  check('进展写在本机', store.readFile(created).progress.includes('交给审查'))
  check('进展不写进仓库', !existsSync(join(emptyRepo, 'PROJECT.md')))
  check('AGENTS.md 只读', store.readAgents(repoDir) === '用 pnpm')
  const before = readFileSync(join(repoDir, 'PROJECT.md'), 'utf8')
  store.create('不覆盖', repoDir)
  check('新建不改仓库里已有的 PROJECT.md', readFileSync(join(repoDir, 'PROJECT.md'), 'utf8') === before)

  const legacyDir = mkdtempSync(join(tmpdir(), 'asc-legacy-'))
  writeFileSync(join(legacyDir, 'PROJECT.md'), renderProjectFile({ goal: '迁走', progress: '一行', rest: '' }), 'utf8')
  const legacy = store.create('迁移', legacyDir)
  rmSync(join(notesDir, 'project-notes', `${legacy.id}.md`))
  const migrated = store.readFile(legacy)
  check('旧 PROJECT.md 读进本机', migrated.goal === '迁走' && existsSync(join(notesDir, 'project-notes', `${legacy.id}.md`)))
  check('我们写的旧文件读入后删除', !existsSync(join(legacyDir, 'PROJECT.md')))

  const foreignDir = mkdtempSync(join(tmpdir(), 'asc-foreign-'))
  writeFileSync(
    join(foreignDir, 'PROJECT.md'),
    `${renderProjectFile({ goal: '别人的', progress: '', rest: '' })}\n## 备注\n别删\n`,
    'utf8'
  )
  const foreign = store.create('外来', foreignDir)
  rmSync(join(notesDir, 'project-notes', `${foreign.id}.md`))
  store.readFile(foreign)
  check('带额外段落的旧文件留在仓库', existsSync(join(foreignDir, 'PROJECT.md')))

  const member = store.create('成员', emptyRepo)
  store.assign(member.id, 'claude', 'key-1')
  check('会话按钥匙挂进项目', store.membership('claude', 'key-1') === member.id)
  store.unassign('claude', 'key-1')
  check('移出项目后不再算这个项目的', store.membership('claude', 'key-1') === null)

  store.assign(member.id, 'claude', 'key-2')
  check('项目删得掉', store.delete(member.id))
  check('删除后项目行没了', store.get(member.id) === null)
  check('删除同时摘掉成员', store.members(member.id).length === 0)
  check('删除同时清掉本机笔记', !existsSync(join(notesDir, 'project-notes', `${member.id}.md`)))
  check('删不存在的项目返回 false', store.delete(member.id) === false)
  store.close()
} finally {
  rmSync(notesDir, { recursive: true, force: true })
  rmSync(repoDir, { recursive: true, force: true })
}

if (failed > 0) {
  console.error(`${failed} checks failed`)
  process.exit(1)
}
console.log('session ledger checks passed')
