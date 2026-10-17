/**
 * 目标和进展是这个人自己的记录，不进项目仓库。
 * 团队约定在仓库根的 AGENTS.md，只读，不由这里改写。
 *
 * PROJECT.md 只用于读旧版本写进仓库的记录，读入本机后不再回写。
 */

export const PROJECT_FILE_NAME = 'PROJECT.md'
export const AGENTS_FILE_NAME = 'AGENTS.md'
/** 注入和展示的上限，按字节计，中英文开销大致相当。 */
export const AGENTS_DOC_MAX_BYTES = 32 * 1024

export interface ProjectFile {
  goal: string
  progress: string
  rest: string
}

const GOAL_HEADING = '## 目标'
const PROGRESS_HEADING = '## 进展'

export function emptyProjectFile(): ProjectFile {
  return { goal: '', progress: '', rest: '' }
}

export function parseProjectFile(source: string): ProjectFile {
  const text = source.replace(/^\uFEFF/, '')
  const goalAt = text.indexOf(GOAL_HEADING)
  const progressAt = text.indexOf(PROGRESS_HEADING)
  if (goalAt < 0 || progressAt < 0 || progressAt < goalAt) {
    return { goal: '', progress: '', rest: text.trim() }
  }
  const goal = text
    .slice(goalAt + GOAL_HEADING.length, progressAt)
    .trim()
  const afterProgress = text.slice(progressAt + PROGRESS_HEADING.length)
  const nextHeading = afterProgress.search(/\n## /)
  const progress =
    nextHeading >= 0 ? afterProgress.slice(0, nextHeading).trim() : afterProgress.trim()
  const rest = nextHeading >= 0 ? afterProgress.slice(nextHeading).trim() : ''
  return { goal, progress, rest }
}

export function renderProjectFile(file: ProjectFile): string {
  const parts = [
    '# 项目',
    '',
    GOAL_HEADING,
    '',
    file.goal.trim(),
    '',
    PROGRESS_HEADING,
    '',
    file.progress.trim()
  ]
  if (file.rest.trim()) {
    parts.push('', file.rest.trim())
  }
  return `${parts.join('\n')}\n`
}

/** 在进展末尾补一句。已有相同一句时不重复写。 */
export function appendProgress(file: ProjectFile, line: string): ProjectFile {
  const trimmed = line.trim()
  if (!trimmed || file.progress.includes(trimmed)) return file
  return {
    ...file,
    progress: file.progress.trim() ? `${file.progress.trim()}\n${trimmed}` : trimmed
  }
}
