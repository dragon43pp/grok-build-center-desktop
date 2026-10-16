/**
 * 项目是会话上面的一层。一个目录一份 PROJECT.md，会话按对话钥匙挂进去。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  appendProgress,
  emptyProjectFile,
  parseProjectFile,
  PROJECT_FILE_NAME,
  renderProjectFile,
  type ProjectFile
} from '../../shared/project-file'

export interface ProjectRecord {
  id: string
  name: string
  cwd: string
  updatedAt: number
}

export interface ProjectMembership {
  projectId: string
  agentId: string
  agentSessionKey: string
}

const NAME_LIMIT = 80

export class ProjectStore {
  private readonly db: DatabaseSync

  constructor(userDataDir: string) {
    mkdirSync(userDataDir, { recursive: true })
    this.db = new DatabaseSync(join(userDataDir, 'session-ledger.sqlite'))
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cwd TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_sessions (
        project_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_session_key TEXT NOT NULL,
        PRIMARY KEY (agent_id, agent_session_key)
      );
    `)
  }

  list(): ProjectRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM projects ORDER BY updated_at DESC')
      .all() as Array<Record<string, unknown>>
    return rows.map(toProject)
  }

  get(id: string): ProjectRecord | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return row ? toProject(row) : null
  }

  create(name: string, cwd: string, now = Date.now()): ProjectRecord {
    const record: ProjectRecord = {
      id: crypto.randomUUID(),
      name: cleanName(name),
      cwd: cwd.trim(),
      updatedAt: now
    }
    this.db
      .prepare('INSERT INTO projects (id, name, cwd, updated_at) VALUES (?, ?, ?, ?)')
      .run(record.id, record.name, record.cwd, now)
    this.writeFile(record, emptyProjectFile())
    return record
  }

  rename(id: string, name: string, now = Date.now()): ProjectRecord | null {
    const current = this.get(id)
    if (!current) return null
    const next = cleanName(name)
    this.db
      .prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?')
      .run(next, now, id)
    return { ...current, name: next, updatedAt: now }
  }

  readFile(project: ProjectRecord): ProjectFile {
    try {
      return parseProjectFile(readFileSync(filePath(project), 'utf8'))
    } catch {
      return emptyProjectFile()
    }
  }

  /** 人改目标或进展。写文件时目标段原样保留调用方给的内容。 */
  saveFile(id: string, file: ProjectFile, now = Date.now()): ProjectFile | null {
    const project = this.get(id)
    if (!project) return null
    this.writeFile(project, file)
    this.touch(id, now)
    return file
  }

  /** 交接、交回、会话结束时补一句进展。不改目标。 */
  note(id: string, line: string, now = Date.now()): ProjectFile | null {
    const project = this.get(id)
    if (!project) return null
    const next = appendProgress(this.readFile(project), line)
    this.writeFile(project, next)
    this.touch(id, now)
    return next
  }

  assign(projectId: string, agentId: string, key: string): void {
    const trimmedKey = key.trim()
    if (!this.get(projectId) || !agentId.trim() || !trimmedKey) return
    this.db
      .prepare(
        `INSERT INTO project_sessions (project_id, agent_id, agent_session_key)
         VALUES (?, ?, ?)
         ON CONFLICT(agent_id, agent_session_key) DO UPDATE SET
           project_id = excluded.project_id`
      )
      .run(projectId, agentId, trimmedKey)
  }

  unassign(agentId: string, key: string): void {
    this.db
      .prepare(
        'DELETE FROM project_sessions WHERE agent_id = ? AND agent_session_key = ?'
      )
      .run(agentId, key.trim())
  }

  membership(agentId: string, key: string): string | null {
    const row = this.db
      .prepare(
        `SELECT project_id FROM project_sessions
         WHERE agent_id = ? AND agent_session_key = ?`
      )
      .get(agentId, key.trim()) as { project_id?: string } | undefined
    return row?.project_id ?? null
  }

  members(projectId: string): ProjectMembership[] {
    const rows = this.db
      .prepare(
        `SELECT project_id, agent_id, agent_session_key
         FROM project_sessions WHERE project_id = ?`
      )
      .all(projectId) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      projectId: String(row.project_id),
      agentId: String(row.agent_id),
      agentSessionKey: String(row.agent_session_key)
    }))
  }

  private touch(id: string, now: number): void {
    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, id)
  }

  private writeFile(project: ProjectRecord, file: ProjectFile): void {
    if (!project.cwd.trim()) return
    mkdirSync(project.cwd, { recursive: true })
    const target = filePath(project)
    const temporary = `${target}.tmp`
    writeFileSync(temporary, renderProjectFile(file), 'utf8')
    renameSync(temporary, target)
  }
}

function filePath(project: ProjectRecord): string {
  return join(project.cwd, PROJECT_FILE_NAME)
}

function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, NAME_LIMIT)
  return trimmed || '未命名项目'
}

function toProject(raw: Record<string, unknown>): ProjectRecord {
  return {
    id: String(raw.id),
    name: String(raw.name),
    cwd: String(raw.cwd),
    updatedAt: Number(raw.updated_at)
  }
}
