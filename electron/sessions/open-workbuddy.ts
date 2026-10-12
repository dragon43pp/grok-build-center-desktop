/**
 * 在 WorkBuddy 或 WorkBuddy AI 里打开一场会话。
 *
 * 国内读 `~/.workbuddy`，国际版读 `~/.workbuddy-ai`。不用 cmd / rundll32。
 * 链接交给 Electron 的 `shell.openExternal`，由系统协议处理程序拉起对应 exe。
 */
import { shell } from 'electron'
import type { SessionsOpenWorkbuddyResult } from '../../shared/ipc-contract'
import { pickLatestWorkbuddy, workbuddyAiChatUrl, workbuddyChatUrl } from '../../shared/workbuddy-open'
import { readWorkbuddyAiSessions, readWorkbuddySessions } from './readers/workbuddy'

export type WorkbuddyProduct = 'workbuddy' | 'workbuddy-ai'

export async function openWorkbuddySession(
  product: WorkbuddyProduct,
  sessionId?: string
): Promise<SessionsOpenWorkbuddyResult> {
  const ai = product === 'workbuddy-ai'
  if (sessionId !== undefined && sessionId.trim() === '') {
    return { ok: false, message: '会话 id 不合法。' }
  }

  let sessions: Awaited<ReturnType<typeof readWorkbuddySessions>>
  try {
    sessions = ai ? await readWorkbuddyAiSessions() : await readWorkbuddySessions()
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }

  const target = sessionId
    ? (sessions.find((session) => session.id === sessionId) ?? null)
    : pickLatestWorkbuddy(sessions)
  if (!target) {
    return {
      ok: false,
      message: sessionId
        ? ai
          ? '这场会话不在 WorkBuddy AI 记录里。'
          : '这场会话不在国内 WorkBuddy 记录里。'
        : ai
          ? '这台电脑上还没有 WorkBuddy AI 会话。'
          : '这台电脑上还没有国内 WorkBuddy 会话。'
    }
  }

  const url = ai ? workbuddyAiChatUrl(target.id) : workbuddyChatUrl(target.id)
  if (!url) {
    return { ok: false, message: ai ? '会话 id 不能拼成 WorkBuddy AI 链接。' : '会话 id 不能拼成国内链接。' }
  }

  try {
    await shell.openExternal(url)
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }

  return {
    ok: true,
    message: ai ? `已在 WorkBuddy AI 里打开「${target.title}」。` : `已在 WorkBuddy 里打开「${target.title}」。`,
    sessionId: target.id,
    title: target.title
  }
}

export async function openDomesticWorkbuddy(
  sessionId?: string
): Promise<SessionsOpenWorkbuddyResult> {
  return openWorkbuddySession('workbuddy', sessionId)
}
