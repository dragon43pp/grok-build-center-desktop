/**
 * 把 ASC 技能写进各家 Agent 自己的技能目录。
 *
 * 只覆盖带 ASC 标记的文件。别人的技能不动。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { ASC_SKILL_MARKDOWN } from './skillText'

const MARKER = 'name: agent-session-center'

export interface SkillRoot {
  agentId: string
  dir: string
}

export function defaultSkillRoots(home = homedir()): SkillRoot[] {
  return [
    { agentId: 'claude', dir: join(home, '.claude', 'skills', 'agent-session-center') },
    { agentId: 'codex', dir: join(home, '.codex', 'skills', 'agent-session-center') },
    { agentId: 'grok', dir: join(home, '.grok', 'skills', 'agent-session-center') },
    { agentId: 'pi', dir: join(home, '.pi', 'agent', 'skills', 'agent-session-center') },
    {
      agentId: 'agy',
      dir: join(home, '.gemini', 'antigravity-cli', 'skills', 'agent-session-center')
    }
  ]
}

export function installAgentSkills(roots: readonly SkillRoot[]): string[] {
  const written: string[] = []
  for (const root of roots) {
    // 家目录还不存在，说明这台机器没装这家 Agent。不为它创建家目录。
    if (!existsSync(dirname(root.dir))) continue
    const path = join(root.dir, 'SKILL.md')
    mkdirSync(root.dir, { recursive: true })
    try {
      const existing = readFileSync(path, 'utf8')
      if (!existing.includes(MARKER)) continue
    } catch {
      // 文件还不存在，可以新建。
    }
    writeFileSync(path, ASC_SKILL_MARKDOWN, 'utf8')
    written.push(path)
  }
  return written
}
