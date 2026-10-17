import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

/**
 * 文件检查点记录层（只记录，不回滚）。
 *
 * 每次观察到文件写入类工具开始执行，就把目标文件的当前内容存成内容寻址的 blob，
 * 记录按 toolUseId 归属。回滚要等「截断各家 CLI 会话历史」那一版一起做：ASC 不持有
 * 模型上下文，只恢复文件会让模型按「文件已改完」继续，回滚是假的。所以这里没有
 * 回滚函数、冲突检测和清扫——那些都服务于回滚，现在做是死代码。
 *
 * 存储：`<root>/<会话 id>/<sha256>`。会话 id 来自 hook，先过白名单，杜绝路径穿越。
 * 路径只来自 hook 记录里的 filePath，调用方不得传入渲染层给的路径。
 */

/** 单文件备份上限：超出只记元信息，不存 blob。 */
export const MAX_BLOB_BYTES = 5 * 1024 * 1024

/** 一条检查点记录。pre 为 null 表示写入前文件不存在。 */
export interface CheckpointRecord {
  toolUseId: string
  /** 目标文件绝对路径（字面形式，与 hook 报告的一致）。 */
  path: string
  /** 写入前内容的 hash；null = 原本不存在。 */
  pre: string | null
  /** 会话内递增序号：同一文件多条记录时据此取「最早」。 */
  seq: number
  /** 超出备份上限，未存 blob。 */
  tooLarge?: boolean
}

/** 会话 id → 目录名。id 来自 hook，白名单外的字符一律去掉，杜绝路径穿越。 */
export function checkpointDirName(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '')
}

export class CheckpointStore {
  private seq = 0
  /** 同一 toolUseId 只记一次：hook 可能重投，重复记录会把「最早」判错。 */
  private readonly seen = new Set<string>()

  constructor(private readonly root: string) {}

  /**
   * 在写入发生前抓取目标文件的当前内容。
   * 拒绝：路径不是绝对路径、是目录或符号链接、会话 id 白名单化后为空。
   * 返回 null 表示这次没记（拒绝或已记过），调用方无需处理。
   */
  capture(sessionId: string, toolUseId: string, filePath: string): CheckpointRecord | null {
    if (this.seen.has(toolUseId)) return null
    if (!isAbsolute(filePath)) return null
    const dirName = checkpointDirName(sessionId)
    if (!dirName) return null

    const abs = resolve(filePath)
    const pre = this.snapshot(dirName, abs)
    if (!pre) return null

    this.seen.add(toolUseId)
    const record: CheckpointRecord = {
      toolUseId,
      path: abs,
      pre: pre.hash,
      seq: ++this.seq,
      ...(pre.tooLarge ? { tooLarge: true } : {})
    }
    return record
  }

  /** 读文件并落 blob。null = 路径不可用（目录、链接、读失败），调用方应放弃这次记录。 */
  private snapshot(
    dirName: string,
    abs: string
  ): { hash: string | null; tooLarge: boolean } | null {
    let stat
    try {
      stat = lstatSync(abs)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { hash: null, tooLarge: false }
      }
      return null
    }
    // 符号链接不跟随：备份链接目标会在回滚时写穿到别处。目录不是文件写入的目标。
    if (stat.isSymbolicLink() || !stat.isFile()) return null
    if (stat.size > MAX_BLOB_BYTES) return { hash: null, tooLarge: true }

    let buf: Buffer
    try {
      buf = readFileSync(abs)
    } catch {
      return null
    }
    const hash = createHash('sha256').update(buf).digest('hex')
    const dir = join(this.root, dirName)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, hash), buf)
    return { hash, tooLarge: false }
  }
}
