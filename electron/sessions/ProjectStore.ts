/**
 * 项目是会话上面的一层。会话按对话钥匙挂进去。
 * 目标和进展写在本机应用数据里，不进项目仓库。
 * 仓库根的 AGENTS.md 只读，当作团队约定。
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openLedger } from './sqlite'
import {
  AGENTS_DOC_MAX_BYTES,
  AGENTS_FILE_NAME,
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

  constructor(private readonly userDataDir: string) {
    mkdirSync(join(userDataDir, 'project-notes'), { recursive: true })
    this.db = openLedger(userDataDir)
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
    this.writeLocal(record, emptyProjectFile())
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
    if (existsSync(notePath(this.userDataDir, project.id))) {
      return readLocal(this.userDataDir, project.id)
    }
    const legacy = readLegacy(project)
    if (legacy && (legacy.goal || legacy.progress || legacy.rest)) {
      this.writeLocal(project, { goal: legacy.goal, progress: legacy.progress, rest: '' })
      removeLegacyIfOurs(project)
      return { goal: legacy.goal, progress: legacy.progress, rest: '' }
    }
    return emptyProjectFile()
  }

  /** 仓库根的 AGENTS.md。读不到就空字符串，不抛错，也不改文件。 */
  readAgents(cwd: string): string {
    if (!cwd.trim()) return ''
    try {
      const bytes = readFileSync(join(cwd, AGENTS_FILE_NAME))
      const truncated = bytes.length > AGENTS_DOC_MAX_BYTES
      let text = bytes.subarray(0, AGENTS_DOC_MAX_BYTES).toString('utf8')
      if (truncated) text = text.replace(/\uFFFD+$/, '')
      text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
      return truncated && text ? `${text}\n…` : text
    } catch {
      return ''
    }
  }

  /** 人改目标或进展。只写本机，不碰项目目录。 */
  saveFile(id: string, file: ProjectFile, now = Date.now()): ProjectFile | null {
    const project = this.get(id)
    if (!project) return null
    this.writeLocal(project, file)
    this.touch(id, now)
    return file
  }

  /** 交接、交回、会话结束时补一句进展。不改目标，不写进仓库。 */
  note(id: string, line: string, now = Date.now()): ProjectFile | null {
    const project = this.get(id)
    if (!project) return null
    const next = appendProgress(this.readFile(project), line)
    this.writeLocal(project, next)
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

  /**
   * 删掉一个项目：先摘掉成员，再删项目行，最后删本机笔记。
   * 成员表没有外键约束，不在这里清就会留下指向空项目的孤儿行。
   */
  delete(id: string): boolean {
    if (!this.get(id)) return false
    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM project_sessions WHERE project_id = ?').run(id)
      this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    const target = notePath(this.userDataDir, id)
    for (const path of [target, `${target}.tmp`]) {
      try {
        unlinkSync(path)
      } catch {
        // 笔记删不掉不影响项目已经消失；下次同名项目是新 id，不会读到它。
      }
    }
    return true
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

  close(): void {
    this.db.close()
  }

  private touch(id: string, now: number): void {
    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, id)
  }

  private writeLocal(project: ProjectRecord, file: ProjectFile): void {
    const target = notePath(this.userDataDir, project.id)
    const temporary = `${target}.tmp`
    writeFileSync(temporary, renderProjectFile(file), 'utf8')
    renameSync(temporary, target)
  }
}

function notePath(userDataDir: string, id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '')
  return join(userDataDir, 'project-notes', `${safe || 'project'}.md`)
}

function readLocal(userDataDir: string, id: string): ProjectFile {
  try {
    return parseProjectFile(readFileSync(notePath(userDataDir, id), 'utf8'))
  } catch {
    return emptyProjectFile()
  }
}

function legacyPath(project: ProjectRecord): string {
  return join(project.cwd, PROJECT_FILE_NAME)
}

function readLegacy(project: ProjectRecord): ProjectFile | null {
  if (!project.cwd.trim()) return null
  try {
    return parseProjectFile(readFileSync(legacyPath(project), 'utf8'))
  } catch {
    return null
  }
}

/** 旧文件是我们写的、且没有额外段落时，读入本机后删掉，避免继续留在仓库里。 */
function removeLegacyIfOurs(project: ProjectRecord): void {
  try {
    const source = readFileSync(legacyPath(project), 'utf8')
    const parsed = parseProjectFile(source)
    if (parsed.rest.trim()) return
    if (!source.replace(/^\uFEFF/, '').trimStart().startsWith('# 项目')) return
    unlinkSync(legacyPath(project))
  } catch {
    // 删不掉就留着。之后的写入不再碰它。
  }
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
