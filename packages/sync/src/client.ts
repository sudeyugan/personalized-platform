import { capture, conflicts, heads, materialize, receive, resolve } from './engine'
import type { Exchange, Records, SyncState, Transport } from './types'

export interface SyncAdapter {
  read(): Records
  /** False means the editor is busy; retain the remote changes for the next pass. */
  apply(records: Records): Promise<boolean>
  persist(state: SyncState): Promise<void>
  transport: Transport
}
export class SyncClient {
  private queue: Promise<unknown> = Promise.resolve()
  private pendingCaptures = 0
  state: SyncState
  private adapter: SyncAdapter
  constructor(state: SyncState, adapter: SyncAdapter) { this.state = state; this.adapter = adapter }
  private run<T>(job: () => Promise<T>): Promise<T> {
    const result = this.queue.then(job, job)
    this.queue = result.catch(() => undefined)
    return result
  }
  private async commit(next: SyncState) {
    await this.adapter.persist(next)
    this.state = next
  }
  capture(records: Records) {
    this.pendingCaptures++
    return this.run(async () => {
      try {
        const next = structuredClone(this.state)
        await capture(next, records)
        await this.commit(next)
      } finally { this.pendingCaptures-- }
    })
  }
  private async apply() {
    if (this.pendingCaptures) return
    const next = structuredClone(this.state)
    const records = materialize(next)
    // Keep the visible local copy while two branches need a decision.
    for (const key of conflicts(next)) {
      if (next.baseline[key]) records[key] = next.baseline[key]
      else delete records[key]
    }
    if (!await this.adapter.apply(records)) return
    next.baseline = records
    for (const key of new Set(next.operations.map(item => item.key))) {
      const versions = heads(next, key)
      if (versions.length === 1) next.selected[key] = versions[0].id
    }
    await this.commit(next)
  }
  sync() {
    return this.run(async () => {
      const initial = structuredClone(this.state)
      await capture(initial, this.adapter.read())
      await this.commit(initial)
      let more = true
      for (let page = 0; page < 64 && (more || this.state.pending.length); page++) {
        const sending = this.state.pending.slice(0, 4)
        const response = await this.adapter.transport(this.state.config.url, '/v1/exchange', this.state.config.token, { after: this.state.cursor, envelopes: sending }) as Exchange
        if (response.space !== this.state.config.space || !Array.isArray(response.entries) || response.entries.length > 4 || typeof response.more !== 'boolean') throw new Error('中枢身份或协议不匹配；未应用。')
        const next = structuredClone(this.state)
        for (const row of response.entries) {
          if (row.seq !== next.cursor + 1) throw new Error('同步历史不连续；未跳过缺失内容。')
          await receive(next, row.envelope)
          next.cursor = row.seq
        }
        if (response.cursor !== next.cursor) throw new Error('同步游标无效。')
        const acknowledged = new Set(sending.map(item => item.id))
        next.pending = next.pending.filter(item => !acknowledged.has(item.id))
        await this.commit(next)
        more = response.more
      }
      await this.apply()
    })
  }
  resolve(key: string, choice: string) {
    return this.run(async () => {
      const next = structuredClone(this.state)
      await resolve(next, key, choice)
      await this.commit(next)
      await this.apply()
    })
  }
  idle() { return this.queue }
}
