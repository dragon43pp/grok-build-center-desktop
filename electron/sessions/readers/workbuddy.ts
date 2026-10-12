/**
 * WorkBuddy —— 本机 GUI 会话记录（`~/.workbuddy/workbuddy.db` 的 `sessions` 表）。
 *
 * WorkBuddy 不是 CLI。终端恢复命令不存在，`planResume` 仍返回
 * no-resume-command，桥接层的 resumable 保持 false，飞书 /继续 不会把它
 * 当成终端会话。
 *
 * 国内客户端注册了 `workbuddy://chat/<id>`。国际版是另一套库
 * （`~/.workbuddy-ai`），由 `readWorkbuddyAiSessions` 读。
 * 打开时各自拼 `workbuddy://chat/<id>` / `workbuddy-ai://chat/<id>`，
 * 跳进客户端里的对应对话，不混用。列表里的 path 仍是 `scheme://<id>`。
 *
 * 数据形状（2026-10-01 实测，1890 行）：
 *   - `sessions`：id / cwd / title / status / created_at / updated_at（毫秒）/
 *     model / deleted_at（软删，过滤掉）。
 *   - `session_usage`：used（上下文 token，不是计费 token）——**故意不映射进
 *     usage**：把它当 input tokens 会让统计页虚报，宁可 costSource='none'。
 *
 * 只读纪律见 `../sqlite.ts`：immutable 优先；WAL 里有数据就拷到临时目录。
 * WorkBuddy 常开，这个库是活 WAL —— 走副本路径是常态。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { emptyUsage, type AgentId, type HistorySession } from '../types'
import { isoFromMs, toTitle } from '../fsUtil'
import { openReadOnly } from '../sqlite'
import { workbuddyAiHome, workbuddyHome } from '../paths'

interface WorkbuddyReadSpec {
  home: string
  agent: Extract<AgentId, 'workbuddy' | 'workbuddy-ai'>
  scheme: 'workbuddy' | 'workbuddy-ai'
}

interface SessionRow {
  id: unknown
  cwd: unknown
  title: unknown
  custom_title: unknown
  created_at: unknown
  updated_at: unknown
  last_activity_at: unknown
  model: unknown
}

function ms(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export async function readWorkbuddySessions(
  rootOverride?: string | null
): Promise<HistorySession[]> {
  return readWorkbuddyDb({
    home: rootOverride || workbuddyHome(),
    agent: 'workbuddy',
    scheme: 'workbuddy'
  })
}

export async function readWorkbuddyAiSessions(
  rootOverride?: string | null
): Promise<HistorySession[]> {
  return readWorkbuddyDb({
    home: rootOverride || workbuddyAiHome(),
    agent: 'workbuddy-ai',
    scheme: 'workbuddy-ai'
  })
}

async function readWorkbuddyDb(spec: WorkbuddyReadSpec): Promise<HistorySession[]> {
  const home = spec.home
  const dbPath = join(home, 'workbuddy.db')
  if (!existsSync(dbPath)) return []

  const db = openReadOnly(dbPath)
  try {
    let rows: SessionRow[]
    try {
      rows = db
        .prepare(
          `SELECT id, cwd, title, custom_title, created_at, updated_at,
                  last_activity_at, model
           FROM sessions WHERE deleted_at IS NULL
           ORDER BY COALESCE(last_activity_at, updated_at, created_at) DESC`
        )
        .all() as unknown as SessionRow[]
    } catch {
      // 旧版本没有这张表（或列变了）—— 如实返回空，别把扫描搞挂。
      return []
    }

    const sessions: HistorySession[] = []
    for (const row of rows) {
      const id = typeof row.id === 'string' ? row.id : ''
      if (!id) continue
      const title =
        toTitle(
          typeof row.custom_title === 'string' && row.custom_title.trim()
            ? row.custom_title
            : row.title
        ) || '(untitled)'
      sessions.push({
        agent: spec.agent,
        id,
        title,
        cwd: typeof row.cwd === 'string' ? row.cwd : '',
        createdAt: isoFromMs(ms(row.created_at)),
        // 与 SQL 的 ORDER BY 同口径：last_activity 优先，页面再排序不会翻乱
        updatedAt: isoFromMs(
          ms(row.last_activity_at) || ms(row.updated_at) || ms(row.created_at)
        ),
        // 库里没有消息计数；不编数字。
        messageCount: 0,
        model: typeof row.model === 'string' ? row.model : '',
        usage: emptyUsage(),
        costUsd: 0,
        costSource: 'none',
        storage: 'db',
        path: `${spec.scheme}://${id}`,
        archived: false,
        subagent: false
      })
    }
    return sessions
  } finally {
    db.close()
  }
}
