/**
 * 定期读消息。隐藏在主进程里用 setTimeout，不拉 cmd、不弹窗。
 * 开关关掉时定时器仍在，但每次都直接返回。
 */
import { loadAssistantConfig } from './store'
import { runDigestPass } from './messages'

const INTERVAL_MS = 10 * 60 * 1000
const START_DELAY_MS = 15_000
const COOLDOWN_MS = 30_000

let userDataDir = ''
let timer: ReturnType<typeof setTimeout> | null = null
let kickTimer: ReturnType<typeof setTimeout> | null = null
let lastStarted = 0

async function runIfDue(): Promise<void> {
  if (!userDataDir) return
  const config = loadAssistantConfig(userDataDir)
  if (!config.digestEnabled) return
  if (Date.now() - lastStarted < COOLDOWN_MS) return
  lastStarted = Date.now()
  await runDigestPass(userDataDir)
}

function loop(): void {
  timer = setTimeout(() => {
    void runIfDue().finally(loop)
  }, INTERVAL_MS)
}

export function startDigestScheduler(dir: string): void {
  userDataDir = dir
  if (timer || kickTimer) return
  timer = setTimeout(() => {
    void runIfDue().finally(loop)
  }, START_DELAY_MS)
}

export function stopDigestScheduler(): void {
  if (timer) clearTimeout(timer)
  if (kickTimer) clearTimeout(kickTimer)
  timer = null
  kickTimer = null
}

/** 用户刚打开定期开关时，不必干等下一个 10 分钟。 */
export function kickDigest(dir: string): void {
  userDataDir = dir
  if (kickTimer) clearTimeout(kickTimer)
  kickTimer = setTimeout(() => {
    kickTimer = null
    void runIfDue()
  }, 2_000)
}
