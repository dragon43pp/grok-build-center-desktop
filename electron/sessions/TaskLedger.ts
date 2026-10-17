/**
 * 任务与问题编号落盘。和会话账本同库，避免两份 userData 各写各的。
 */
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { openLedger } from './sqlite'
import type {
  AnswerTaskQuestionResult,
  OpenTaskQuestionInput,
  TaskQuestionRow,
  TaskRow
} from '../../shared/task-ledger'

export class TaskLedger {
  private readonly db: DatabaseSync

  constructor(userDataDir: string) {
    this.db = openLedger(userDataDir)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        goal TEXT NOT NULL,
        cwd TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS task_sessions (
        task_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        attached_at INTEGER NOT NULL,
        PRIMARY KEY (task_id, session_id)
      );
      CREATE TABLE IF NOT EXISTS task_questions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        choices_json TEXT NOT NULL,
        status TEXT NOT NULL,
        answer TEXT,
        answered_by TEXT,
        created_at INTEGER NOT NULL,
        answered_at INTEGER
      );
    `)
  }

  create(input: { title: string; goal?: string; cwd: string }, now = Date.now()): TaskRow {
    const row: TaskRow = {
      id: randomUUID(),
      title: input.title.trim() || '未命名任务',
      goal: input.goal?.trim() ?? '',
      cwd: input.cwd,
      status: 'open',
      createdAt: now,
      updatedAt: now
    }
    this.db
      .prepare(
        `INSERT INTO tasks (id, title, goal, cwd, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'open', ?, ?)`
      )
      .run(row.id, row.title, row.goal, row.cwd, now, now)
    return row
  }

  attachSession(taskId: string, sessionId: string, now = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO task_sessions (task_id, session_id, attached_at)
         VALUES (?, ?, ?)
         ON CONFLICT(task_id, session_id) DO NOTHING`
      )
      .run(taskId, sessionId, now)
    this.touch(taskId, now)
  }

  taskIdForSession(sessionId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT task_id FROM task_sessions WHERE session_id = ? ORDER BY attached_at DESC LIMIT 1`
      )
      .get(sessionId) as { task_id?: string } | undefined
    return row?.task_id ?? null
  }

  listOpen(): TaskRow[] {
    return this.db
      .prepare(`SELECT * FROM tasks WHERE status = 'open' ORDER BY updated_at DESC`)
      .all()
      .map((row) => toTask(row as Record<string, unknown>))
  }

  openQuestion(input: OpenTaskQuestionInput, now = Date.now()): TaskQuestionRow {
    const choices = [...(input.choices ?? [])]
    this.db
      .prepare(
        `INSERT INTO task_questions (
           id, task_id, session_id, prompt, choices_json, status, created_at
         ) VALUES (?, ?, ?, ?, ?, 'open', ?)`
      )
      .run(
        input.id,
        input.taskId,
        input.sessionId,
        input.prompt,
        JSON.stringify(choices),
        now
      )
    this.touch(input.taskId, now)
    return this.getQuestion(input.id)!
  }

  /**
   * 按问题编号作答。已经答过的题返回第一次的答案，不改写。
   * 这样飞书、命令行和另一个 Agent 抢答时，只有第一次算数。
   */
  answer(
    questionId: string,
    answer: string,
    answeredBy: string,
    now = Date.now()
  ): AnswerTaskQuestionResult | null {
    const existing = this.getQuestion(questionId)
    if (!existing) return null
    if (existing.status === 'answered') {
      return { ok: true, question: existing, alreadyAnswered: true }
    }
    if (existing.choices.length > 0 && !existing.choices.includes(answer)) {
      return null
    }
    this.db
      .prepare(
        `UPDATE task_questions
         SET status = 'answered', answer = ?, answered_by = ?, answered_at = ?
         WHERE id = ? AND status = 'open'`
      )
      .run(answer, answeredBy, now, questionId)
    this.touch(existing.taskId, now)
    return {
      ok: true,
      question: this.getQuestion(questionId)!,
      alreadyAnswered: false
    }
  }

  listOpenQuestions(taskId?: string): TaskQuestionRow[] {
    const rows = taskId
      ? this.db
          .prepare(
            `SELECT * FROM task_questions WHERE task_id = ? AND status = 'open' ORDER BY created_at`
          )
          .all(taskId)
      : this.db
          .prepare(`SELECT * FROM task_questions WHERE status = 'open' ORDER BY created_at`)
          .all()
    return rows.map((row) => toQuestion(row as Record<string, unknown>))
  }

  getQuestion(id: string): TaskQuestionRow | null {
    const row = this.db.prepare('SELECT * FROM task_questions WHERE id = ?').get(id)
    return row ? toQuestion(row as Record<string, unknown>) : null
  }

  close(): void {
    this.db.close()
  }

  private touch(taskId: string, now: number): void {
    this.db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(now, taskId)
  }
}

function toTask(raw: Record<string, unknown>): TaskRow {
  return {
    id: String(raw.id),
    title: String(raw.title),
    goal: String(raw.goal),
    cwd: String(raw.cwd),
    status: raw.status === 'done' ? 'done' : 'open',
    createdAt: Number(raw.created_at),
    updatedAt: Number(raw.updated_at)
  }
}

function toQuestion(raw: Record<string, unknown>): TaskQuestionRow {
  return {
    id: String(raw.id),
    taskId: String(raw.task_id),
    sessionId: String(raw.session_id),
    prompt: String(raw.prompt),
    choices: parseChoices(raw.choices_json),
    status: raw.status === 'answered' ? 'answered' : 'open',
    answer: typeof raw.answer === 'string' ? raw.answer : null,
    answeredBy: typeof raw.answered_by === 'string' ? raw.answered_by : null,
    createdAt: Number(raw.created_at),
    answeredAt: raw.answered_at == null ? null : Number(raw.answered_at)
  }
}

function parseChoices(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}
