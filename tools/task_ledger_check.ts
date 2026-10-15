/**
 * 任务 id 与问题编号的纯检查。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TaskLedger } from '../electron/sessions/TaskLedger'

let failed = 0
function check(name: string, ok: boolean): void {
  if (ok) console.log(`ok  ${name}`)
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

const dir = mkdtempSync(join(tmpdir(), 'asc-task-'))
try {
  const tasks = new TaskLedger(dir)
  const task = tasks.create({ title: '改会话中心', cwd: 'D:\\agent-session-center' })
  tasks.attachSession(task.id, 'session-a')
  tasks.openQuestion({
    id: 'req-1',
    taskId: task.id,
    sessionId: 'session-a',
    prompt: '要删这行吗',
    choices: ['approved', 'denied']
  })
  const rejected = tasks.answer('req-1', 'later', 'cli')
  const first = tasks.answer('req-1', 'approved', 'feishu')
  const second = tasks.answer('req-1', 'denied', 'cli')
  check('选项外的答案拒绝', rejected === null)
  check('第一次作答写入', first?.question.answer === 'approved' && first.alreadyAnswered === false)
  check('第二次作答不改写', second?.alreadyAnswered === true && second.question.answer === 'approved')
  const open = tasks.openQuestion({
    id: 'req-2',
    taskId: task.id,
    sessionId: 'session-a',
    prompt: '目录用哪个'
  })
  check('开放问题能列出来', tasks.listOpenQuestions(task.id).some((row) => row.id === open.id))
  check('会话能找回任务 id', tasks.taskIdForSession('session-a') === task.id)
  tasks.close()
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (failed > 0) process.exit(1)
console.log('task ledger checks passed')
