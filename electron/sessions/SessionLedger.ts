/**
 * ASC 会话账本落盘。只写 userData，不碰各家 CLI 的会话库。
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  LedgerStatus,
  SessionLedgerRow,
  SessionLedgerUpsert
} from '../../shared/session-ledger'

export class SessionLedger {
  private readonly db: DatabaseSync

  constructor(userDataDir: string) {
    mkdirSync(userDataDir, { recursive: true })
    this.db = new DatabaseSync(join(userDataDir, 'session-ledger.sqlite'))
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        installation_id TEXT NOT NULL,
        agent_session_key TEXT,
        name TEXT NOT NULL,
        cwd TEXT NOT NULL,
        args_json TEXT NOT NULL,
        cols INTEGER NOT NULL,
        rows INTEGER NOT NULL,
        status TEXT NOT NULL,
        resume_on_launch INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        stopped_at INTEGER
      )
    `)
    const columns = this.db.prepare('PRAGMA table_info(sessions)').all() as Array<{
      name: string
    }>
    if (!columns.some((column) => column.name === 'host_pty_id')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN host_pty_id TEXT')
    }
    if (!columns.some((column) => column.name === 'terminal_id')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN terminal_id TEXT')
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_names (
        agent_id TEXT NOT NULL,
        agent_session_key TEXT NOT NULL,
        name TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (agent_id, agent_session_key)
      )
    `)
  }

  /** 用户改过的名字。按 CLI 和对话钥匙记，重启和历史查询都认这一份。 */
  rememberName(
    agentId: string,
    key: string,
    name: string,
    now = Date.now()
  ): void {
    const trimmedKey = key.trim()
    const trimmedName = name.trim().slice(0, 128)
    if (!agentId.trim() || !trimmedKey || !trimmedName) return
    this.db
      .prepare(
        `INSERT INTO session_names (agent_id, agent_session_key, name, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(agent_id, agent_session_key) DO UPDATE SET
           name = excluded.name,
           updated_at = excluded.updated_at`
      )
      .run(agentId, trimmedKey, trimmedName, now)
  }

  lookupName(agentId: string, key: string): string | null {
    const row = this.db
      .prepare(
        `SELECT name FROM session_names
         WHERE agent_id = ? AND agent_session_key = ?`
      )
      .get(agentId, key.trim()) as { name?: string } | undefined
    const name = row?.name?.trim()
    return name || null
  }

  /** 改当前这一场的账本名。有钥匙时同时写入名字表。 */
  renameSession(id: string, name: string, now = Date.now()): void {
    const trimmed = name.trim().slice(0, 128)
    if (!trimmed) return
    this.db
      .prepare('UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?')
      .run(trimmed, now, id)
    const row = this.get(id)
    if (row?.agentSessionKey) {
      this.rememberName(row.agentId, row.agentSessionKey, trimmed, now)
    }
  }

  upsertRunning(input: SessionLedgerUpsert, now = Date.now()): void {
    const existing = this.get(input.id)
    this.db
      .prepare(
        `INSERT INTO sessions (
           id, agent_id, installation_id, agent_session_key, name, cwd,
           args_json, cols, rows, status, resume_on_launch,
           started_at, updated_at, stopped_at, host_pty_id, terminal_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', 0, ?, ?, NULL, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           agent_id = excluded.agent_id,
           installation_id = excluded.installation_id,
           agent_session_key = COALESCE(excluded.agent_session_key, sessions.agent_session_key),
           name = excluded.name,
           cwd = excluded.cwd,
           args_json = excluded.args_json,
           cols = excluded.cols,
           rows = excluded.rows,
           status = 'running',
           resume_on_launch = 0,
           host_pty_id = COALESCE(excluded.host_pty_id, sessions.host_pty_id),
           terminal_id = COALESCE(excluded.terminal_id, sessions.terminal_id),
           updated_at = excluded.updated_at,
           stopped_at = NULL`
      )
      .run(
        input.id,
        input.agentId,
        input.installationId,
        input.agentSessionKey ?? null,
        input.name,
        input.cwd,
        JSON.stringify(input.args),
        input.cols,
        input.rows,
        existing?.startedAt ?? now,
        now,
        input.hostPtyId ?? existing?.hostPtyId ?? null,
        input.terminalId ?? existing?.terminalId ?? null
      )
    if (input.agentSessionKey) {
      this.db
        .prepare(
          `UPDATE sessions
           SET resume_on_launch = 0, updated_at = ?
           WHERE agent_session_key = ? AND id != ? AND status != 'running'`
        )
        .run(now, input.agentSessionKey, input.id)
    }
  }

  /** observer 捕获到 CLI 自己的对话 id 后写入。空值不覆盖已有钥匙。 */
  captureKey(id: string, key: string, now = Date.now()): void {
    const trimmed = key.trim()
    if (!trimmed) return
    this.db
      .prepare(
        `UPDATE sessions
         SET agent_session_key = ?, updated_at = ?
         WHERE id = ? AND (agent_session_key IS NULL OR agent_session_key = '')`
      )
      .run(trimmed, now, id)
  }

  /** 对话文件已经不在，清掉重进标记，避免下次启动再提示。 */
  clearResume(id: string, now = Date.now()): void {
    this.db
      .prepare(
        `UPDATE sessions SET resume_on_launch = 0, updated_at = ? WHERE id = ?`
      )
      .run(now, id)
  }

  markStatus(
    id: string,
    status: Exclude<LedgerStatus, 'running'>,
    resumeOnLaunch: boolean,
    now = Date.now()
  ): void {
    this.db
      .prepare(
        `UPDATE sessions
         SET status = ?, resume_on_launch = ?, updated_at = ?, stopped_at = ?
         WHERE id = ? AND status = 'running'`
      )
      .run(status, resumeOnLaunch ? 1 : 0, now, now, id)
  }

  /** 进程没了但账本还写着 running：下次启动按崩溃恢复。 */
  demoteStaleRunning(now = Date.now()): number {
    const result = this.db
      .prepare(
        `UPDATE sessions
         SET status = 'crashed', resume_on_launch = 1, updated_at = ?, stopped_at = ?
         WHERE status = 'running'`
      )
      .run(now, now)
    return Number(result.changes ?? 0)
  }

  /**
   * 安装更新或退出时，进程停了，账本却还写着 running，重进标记也是 0。
   * 这些行进不了重进名单，窗口重开就只剩匿名终端。
   * 有钥匙的改成 crashed 并打上重进标记；没钥匙的标成 stopped，避免空拉起。
   */
  repairInterrupted(now = Date.now()): number {
    const keyed = this.db
      .prepare(
        `UPDATE sessions
         SET status = 'crashed', resume_on_launch = 1, updated_at = ?, stopped_at = ?
         WHERE status = 'running'
           AND (host_pty_id IS NULL OR host_pty_id = '')
           AND agent_session_key IS NOT NULL AND agent_session_key != ''`
      )
      .run(now, now)
    const bare = this.db
      .prepare(
        `UPDATE sessions
         SET status = 'stopped', resume_on_launch = 0, updated_at = ?, stopped_at = ?
         WHERE status = 'running'
           AND (host_pty_id IS NULL OR host_pty_id = '')
           AND (agent_session_key IS NULL OR agent_session_key = '')`
      )
      .run(now, now)
    return Number(keyed.changes ?? 0) + Number(bare.changes ?? 0)
  }

  listResumeOnLaunch(): SessionLedgerRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions
         WHERE agent_session_key IS NOT NULL AND agent_session_key != ''
           AND (
             (resume_on_launch = 1 AND status != 'running')
             OR status = 'running'
           )
         ORDER BY updated_at DESC`
      )
      .all()
    return rows.map(toRow)
  }

  /** 宿主里还活着的终端。重开窗口时用它重连，不另起一场。 */
  listLiveAttached(): SessionLedgerRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions
         WHERE status = 'running' AND host_pty_id IS NOT NULL AND host_pty_id != ''
         ORDER BY updated_at DESC`
      )
      .all()
    return rows.map(toRow)
  }

  get(id: string): SessionLedgerRow | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
    return row ? toRow(row as Record<string, unknown>) : null
  }

  close(): void {
    this.db.close()
  }
}

function toRow(raw: Record<string, unknown>): SessionLedgerRow {
  return {
    id: String(raw.id),
    agentId: String(raw.agent_id),
    installationId: String(raw.installation_id),
    agentSessionKey:
      typeof raw.agent_session_key === 'string' && raw.agent_session_key
        ? raw.agent_session_key
        : null,
    name: String(raw.name),
    cwd: String(raw.cwd),
    args: parseArgs(raw.args_json),
    cols: Number(raw.cols),
    rows: Number(raw.rows),
    status: raw.status as SessionLedgerRow['status'],
    resumeOnLaunch: Number(raw.resume_on_launch) === 1,
    startedAt: Number(raw.started_at),
    updatedAt: Number(raw.updated_at),
    stoppedAt: raw.stopped_at == null ? null : Number(raw.stopped_at),
    hostPtyId:
      typeof raw.host_pty_id === 'string' && raw.host_pty_id ? raw.host_pty_id : null,
    terminalId:
      typeof raw.terminal_id === 'string' && raw.terminal_id ? raw.terminal_id : null
  }
}

function parseArgs(value: unknown): string[] {
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
