/**
 * 多电脑共享表的读写。
 *
 * 长连接集群模式下，任意一台已连接的 ASC 都可能收到消息。它自己执行不了
 * 别的电脑上的会话，就把命令写进这张表；目标电脑轮询自己的行，执行完再
 * 用同一个机器人把结果发回对话。
 *
 * 三张表，都在已经建好的「AI 会话中心」里：
 *   - 电脑：心跳。90 秒内有心跳算在线。
 *   - 命令：跨机继续 / 打开 / 拉列表。命令号来自消息 id，重投不会执行两次。
 *   - 序号：/列表 之后的「第 N 条」对照。下一句可能落到另一台电脑上。
 */

import type { BitableRestClient } from './bitable'
import { cellNumber, cellText, FLEET_INDEX_TTL_MS, type FleetComputer, type FleetSlot } from './fleet'

export interface FleetCommand {
  id: string
  targetId: string
  action: string
  payload: Record<string, unknown>
  openId: string
  createdAt: number
}

export interface FleetTableIds {
  sessions: string
  computers: string
  commands: string
  slots: string
}

interface ListedRecord {
  recordId: string
  fields: Record<string, unknown>
}

const CHUNK = 200

async function assertOk(
  response: { code?: number; msg?: string; data?: unknown },
  context: string
): Promise<NonNullable<{ items?: unknown; records?: unknown; has_more?: boolean; page_token?: string }>> {
  const code = Number(response?.code ?? 0)
  if (code !== 0) {
    throw new Error(`${context} 失败：飞书错误 ${code} ${response?.msg || ''}`.trim())
  }
  return (response.data ?? {}) as NonNullable<{
    items?: unknown
    records?: unknown
    has_more?: boolean
    page_token?: string
  }>
}

export class FleetStore {
  constructor(
    private readonly client: BitableRestClient,
    private readonly appToken: string,
    private readonly tables: FleetTableIds
  ) {}

  async upsertComputer(computer: { id: string; name: string }, seenAt: number): Promise<void> {
    const rows = await this.listRecords(this.tables.computers)
    const existing = rows.find((row) => cellText(row.fields['电脑ID']) === computer.id)
    const fields = {
      电脑ID: computer.id,
      电脑: computer.name,
      最近心跳: seenAt
    }
    if (!existing) {
      await this.batchCreate(this.tables.computers, [fields])
      return
    }
    await this.batchUpdate(this.tables.computers, [{ recordId: existing.recordId, fields }])
  }

  async listComputers(): Promise<FleetComputer[]> {
    const rows = await this.listRecords(this.tables.computers)
    const computers: FleetComputer[] = []
    for (const row of rows) {
      const id = cellText(row.fields['电脑ID'])
      const name = cellText(row.fields['电脑'])
      const seenAt = cellNumber(row.fields['最近心跳']) ?? 0
      if (!id || !name) continue
      computers.push({ id, name, seenAt })
    }
    return computers
  }

  /** 已有同号命令就不动。返回 exists 表示这条飞书消息已经交过。 */
  async putCommand(command: FleetCommand): Promise<'created' | 'exists'> {
    const rows = await this.listRecords(this.tables.commands)
    if (rows.some((row) => cellText(row.fields['命令ID']) === command.id)) return 'exists'
    await this.batchCreate(this.tables.commands, [
      {
        命令ID: command.id,
        目标电脑ID: command.targetId,
        动作: command.action,
        参数: JSON.stringify(command.payload).slice(0, 4000),
        状态: 'pending',
        结果: '',
        发起人: command.openId,
        创建时间: command.createdAt
      }
    ])
    return 'created'
  }

  /**
   * 领走发给这台电脑、还在 pending 的命令，并改成 running。
   * 一次最多一条，避免一轮心跳被一长串恢复堵住。
   * running 超过 2 分钟且还没有结果的，视为上一轮进程没写完，再领一次。
   */
  async claimNext(targetId: string, now: number): Promise<FleetCommand | null> {
    const rows = await this.listRecords(this.tables.commands)
    const mine = rows.filter((row) => cellText(row.fields['目标电脑ID']) === targetId)
    const pending = mine.find((row) => cellText(row.fields['状态']) === 'pending')
    const stale = mine.find((row) => {
      if (cellText(row.fields['状态']) !== 'running') return false
      if (cellText(row.fields['结果'])) return false
      const createdAt = cellNumber(row.fields['创建时间']) ?? 0
      return createdAt > 0 && now - createdAt > 120_000
    })
    const row = pending ?? stale
    if (!row) return null
    const command = this.toCommand(row)
    if (!command) return null
    await this.batchUpdate(this.tables.commands, [
      {
        recordId: row.recordId,
        fields: { ...row.fields, 状态: 'running' }
      }
    ])
    return command
  }

  async finishCommand(id: string, status: 'done' | 'failed', result: string): Promise<void> {
    const rows = await this.listRecords(this.tables.commands)
    const row = rows.find((item) => cellText(item.fields['命令ID']) === id)
    if (!row) return
    await this.batchUpdate(this.tables.commands, [
      {
        recordId: row.recordId,
        fields: {
          ...row.fields,
          状态: status,
          结果: result.slice(0, 1500)
        }
      }
    ])
  }

  async replaceSlots(openId: string, kind: 'history' | 'active', slots: readonly FleetSlot[]): Promise<void> {
    const rows = await this.listRecords(this.tables.slots)
    const stale = rows.filter(
      (row) => cellText(row.fields['用户']) === openId && cellText(row.fields['种类']) === kind
    )
    if (stale.length > 0) {
      await this.batchDelete(
        this.tables.slots,
        stale.map((row) => row.recordId)
      )
    }
    const now = Date.now()
    const records = slots.slice(0, 10).map((slot) => ({
      用户: openId,
      种类: kind,
      序号: slot.n,
      电脑ID: slot.computerId,
      电脑: slot.computerName,
      会话ID: slot.sid,
      CLI: slot.agent,
      标题: slot.title,
      更新时间: now
    }))
    if (records.length > 0) await this.batchCreate(this.tables.slots, records)
  }

  /** 表读失败返回 null（调用方改用本进程缓存）。读到了就返回数组，过期的不带上。 */
  async readSlots(openId: string, kind: 'history' | 'active', now = Date.now()): Promise<FleetSlot[] | null> {
    let rows: ListedRecord[]
    try {
      rows = await this.listRecords(this.tables.slots)
    } catch {
      return null
    }
    const slots: FleetSlot[] = []
    for (const row of rows) {
      if (cellText(row.fields['用户']) !== openId) continue
      if (cellText(row.fields['种类']) !== kind) continue
      const updatedAt = cellNumber(row.fields['更新时间']) ?? 0
      if (!updatedAt || now - updatedAt > FLEET_INDEX_TTL_MS) continue
      const n = cellNumber(row.fields['序号'])
      const sid = cellText(row.fields['会话ID'])
      if (!n || !sid) continue
      slots.push({
        n,
        computerId: cellText(row.fields['电脑ID']),
        computerName: cellText(row.fields['电脑']),
        sid,
        agent: cellText(row.fields['CLI']),
        title: cellText(row.fields['标题'])
      })
    }
    slots.sort((a, b) => a.n - b.n)
    return slots
  }

  async listSessions(computerId: string): Promise<
    Array<{ sid: string; agent: string; title: string; updatedAt: number }>
  > {
    const rows = await this.listRecords(this.tables.sessions)
    const sessions = rows
      .filter((row) => cellText(row.fields['电脑ID']) === computerId)
      .map((row) => ({
        sid: cellText(row.fields['会话ID']),
        agent: cellText(row.fields['代理ID']) || cellText(row.fields['CLI']),
        title: cellText(row.fields['标题']) || '(未命名)',
        updatedAt: cellNumber(row.fields['最后活动']) ?? 0
      }))
      .filter((session) => session.sid)
    sessions.sort((a, b) => b.updatedAt - a.updatedAt)
    return sessions.slice(0, 8)
  }

  private toCommand(row: ListedRecord): FleetCommand | null {
    const id = cellText(row.fields['命令ID'])
    const targetId = cellText(row.fields['目标电脑ID'])
    const action = cellText(row.fields['动作'])
    if (!id || !targetId || !action) return null
    let payload: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(cellText(row.fields['参数']) || '{}') as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>
      }
    } catch {
      payload = {}
    }
    return {
      id,
      targetId,
      action,
      payload,
      openId: cellText(row.fields['发起人']),
      createdAt: cellNumber(row.fields['创建时间']) ?? Date.now()
    }
  }

  private async listRecords(tableId: string): Promise<ListedRecord[]> {
    const records: ListedRecord[] = []
    let pageToken: string | undefined
    for (;;) {
      const data = await assertOk(
        await this.client.bitable.appTableRecord.list({
          path: { app_token: this.appToken, table_id: tableId },
          params: { page_size: 500, ...(pageToken ? { page_token: pageToken } : {}) }
        }),
        '读记录'
      )
      const items = (data as { items?: Array<{ record_id?: string; fields?: Record<string, unknown> }> }).items ?? []
      for (const item of items) {
        if (!item.record_id) continue
        records.push({ recordId: item.record_id, fields: item.fields ?? {} })
      }
      const page = data as { has_more?: boolean; page_token?: string }
      if (!page.has_more) break
      pageToken = page.page_token || undefined
      if (!pageToken) break
    }
    return records
  }

  private async batchCreate(tableId: string, records: Array<Record<string, unknown>>): Promise<void> {
    for (let i = 0; i < records.length; i += CHUNK) {
      await assertOk(
        await this.client.bitable.appTableRecord.batchCreate({
          path: { app_token: this.appToken, table_id: tableId },
          data: { records: records.slice(i, i + CHUNK).map((fields) => ({ fields })) }
        }),
        '批量新增'
      )
    }
  }

  private async batchUpdate(
    tableId: string,
    records: Array<{ recordId: string; fields: Record<string, unknown> }>
  ): Promise<void> {
    for (let i = 0; i < records.length; i += CHUNK) {
      await assertOk(
        await this.client.bitable.appTableRecord.batchUpdate({
          path: { app_token: this.appToken, table_id: tableId },
          data: {
            records: records.slice(i, i + CHUNK).map((record) => ({
              record_id: record.recordId,
              fields: record.fields
            }))
          }
        }),
        '批量更新'
      )
    }
  }

  private async batchDelete(tableId: string, recordIds: string[]): Promise<void> {
    for (let i = 0; i < recordIds.length; i += CHUNK) {
      await assertOk(
        await this.client.bitable.appTableRecord.batchDelete({
          path: { app_token: this.appToken, table_id: tableId },
          data: { records: recordIds.slice(i, i + CHUNK) }
        }),
        '批量删除'
      )
    }
  }
}
