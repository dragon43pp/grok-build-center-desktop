/**
 * 对话文件核对。只用临时目录，不读用户的 CLI 家目录。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { probeConversationFile } from '../electron/sessions/conversationProbe'

let failed = 0
function check(name: string, ok: boolean): void {
  if (ok) console.log(`ok  ${name}`)
  else {
    failed += 1
    console.error(`FAIL ${name}`)
  }
}

const dir = mkdtempSync(join(tmpdir(), 'asc-probe-'))
const previous = process.env.CLAUDE_CONFIG_DIR
process.env.CLAUDE_CONFIG_DIR = dir
try {
  const project = join(dir, 'projects', 'demo')
  mkdirSync(project, { recursive: true })
  writeFileSync(join(project, 'ses_abc.jsonl'), '{}\n')
  const found = await probeConversationFile('claude', 'ses_abc')
  const missing = await probeConversationFile('claude', 'ses_gone')
  const unsafe = await probeConversationFile('claude', '../ses_abc')
  check('文件在就允许重进', found.ok)
  check('文件不在就拒绝', !missing.ok && missing.reason === 'missing-file')
  check('路径穿越拒绝', !unsafe.ok && unsafe.reason === 'missing-key')
} finally {
  if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = previous
  rmSync(dir, { recursive: true, force: true })
}

if (failed > 0) process.exit(1)
console.log('conversation probe checks passed')
