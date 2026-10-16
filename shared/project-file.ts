/**
 * 一个项目一份文件。目标由人写，进展由交接补上，人也可以改。
 *
 * 文件放在项目目录下，名字固定为 PROJECT.md。只认这两段，其余内容原样留在文件末尾。
 */

export const PROJECT_FILE_NAME = 'PROJECT.md'

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
