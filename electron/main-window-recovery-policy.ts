/** 60 秒内最多重载这么多次。再崩就停，避免坏页面把恢复打成死循环。 */
export const MAIN_RENDERER_RECOVERY_LIMIT = 3
export const MAIN_RENDERER_RECOVERY_WINDOW_MS = 60_000

export type MainRendererRecoveryAction = 'ignore' | 'reload' | 'give-up'

export function decideMainRendererRecovery(input: {
  quitting: boolean
  windowDestroyed: boolean
  reloadPending: boolean
  now: number
  crashTimes: number[]
  limit?: number
  windowMs?: number
}): { action: MainRendererRecoveryAction; crashTimes: number[] } {
  if (input.quitting || input.windowDestroyed || input.reloadPending) {
    return { action: 'ignore', crashTimes: input.crashTimes }
  }
  const limit = input.limit ?? MAIN_RENDERER_RECOVERY_LIMIT
  const windowMs = input.windowMs ?? MAIN_RENDERER_RECOVERY_WINDOW_MS
  const crashTimes = input.crashTimes.filter((time) => input.now - time < windowMs)
  crashTimes.push(input.now)
  if (crashTimes.length > limit) {
    return { action: 'give-up', crashTimes }
  }
  return { action: 'reload', crashTimes }
}

export function recoveryDelayMs(attempt: number): number {
  if (attempt <= 1) return 0
  if (attempt === 2) return 400
  return 1_200
}
