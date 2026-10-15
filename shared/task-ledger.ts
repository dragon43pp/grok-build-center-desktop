/**
 * ASC 任务层。
 *
 * 会话 id 只认一场终端。任务 id 认一件工作：可以有多场会话，也可以有多个
 * 有编号的问题。手机、命令行、另一个 Agent 都按同一个 question id 作答。
 */

export type TaskStatus = 'open' | 'done'
export type TaskQuestionStatus = 'open' | 'answered'

export interface TaskRow {
  id: string
  title: string
  goal: string
  cwd: string
  status: TaskStatus
  createdAt: number
  updatedAt: number
}

export interface TaskQuestionRow {
  id: string
  taskId: string
  sessionId: string
  prompt: string
  choices: string[]
  status: TaskQuestionStatus
  answer: string | null
  answeredBy: string | null
  createdAt: number
  answeredAt: number | null
}

export interface OpenTaskQuestionInput {
  id: string
  taskId: string
  sessionId: string
  prompt: string
  choices?: readonly string[]
}

export interface AnswerTaskQuestionResult {
  ok: true
  question: TaskQuestionRow
  /** 同一题再答一次时为 true。第一次的答案保持不变。 */
  alreadyAnswered: boolean
}
