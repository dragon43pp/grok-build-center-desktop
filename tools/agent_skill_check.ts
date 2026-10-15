/**
 * 技能安装只覆盖带 ASC 标记的文件。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installAgentSkills } from '../electron/agents/installAgentSkill'

let failed = 0
function check(name: string, ok: boolean): void {
  if (ok) console.log(`ok  ${name}`)
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

const dir = mkdtempSync(join(tmpdir(), 'asc-skill-'))
try {
  const owned = join(dir, 'owned')
  const foreign = join(dir, 'foreign')
  mkdirSync(foreign, { recursive: true })
  writeFileSync(join(foreign, 'SKILL.md'), '---\nname: someone-else\n---\nleave me\n', 'utf8')
  const written = installAgentSkills([
    { agentId: 'claude', dir: owned },
    { agentId: 'codex', dir: foreign }
  ])
  check('新建 ASC 技能', written.includes(join(owned, 'SKILL.md')))
  check(
    '正文只写已有命令',
    readFileSync(join(owned, 'SKILL.md'), 'utf8').includes('asc tasks answer')
  )
  check('别人的技能不覆盖', readFileSync(join(foreign, 'SKILL.md'), 'utf8').includes('someone-else'))
  const missing = join(dir, 'no-home', 'skills', 'agent-session-center')
  const skipped = installAgentSkills([{ agentId: 'claude', dir: missing }])
  check('家目录不存在不创建', skipped.length === 0 && !existsSync(join(dir, 'no-home')))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (failed > 0) process.exit(1)
console.log('agent skill checks passed')
