import { open, seal } from './crypto'
import { type Operation, type Records, type SyncState, stableJson, validateOperation } from './types'

export function heads(state: SyncState, key: string): Operation[] {
  const operations = state.operations.filter(item => item.key === key)
  const parents = new Set(operations.flatMap(item => item.parents))
  return operations.filter(item => !parents.has(item.id)).sort((a, b) => a.id.localeCompare(b.id))
}
export function conflicts(state: SyncState): string[] {
  return [...new Set(state.operations.map(item => item.key))].filter(key => heads(state, key).length > 1)
}
export function materialize(state: SyncState): Records {
  const records: Records = {}
  for (const key of new Set(state.operations.map(item => item.key))) {
    const choices = heads(state, key)
    const choice = choices.find(item => item.id === state.selected[key]) ?? choices[0]
    if (choice?.value) records[key] = choice.value
  }
  return records
}
function insert(state: SyncState, operation: Operation) {
  validateOperation(operation)
  const existing = state.operations.find(item => item.id === operation.id)
  if (existing) {
    if (stableJson(existing) !== stableJson(operation)) throw new Error('同步操作标识冲突；已停止同步。')
    return
  }
  for (const parent of operation.parents) {
    const found = state.operations.find(item => item.id === parent)
    if (!found || found.key !== operation.key) throw new Error('同步历史不完整；已停止，未跳过记录。')
  }
  state.operations.push(operation)
}
async function append(state: SyncState, key: string, value: Operation['value'], parents: string[]) {
  const operation: Operation = { v: 1, id: crypto.randomUUID(), device: state.config.device, key, value, parents, at: new Date().toISOString() }
  const envelope = await seal(operation, state.config.key, state.config.space)
  insert(state, operation)
  state.selected[key] = operation.id
  state.pending.push(envelope)
}
/** Capture only committed local changes. The caller persists this state before sending. */
export async function capture(state: SyncState, records: Records): Promise<void> {
  for (const key of new Set([...Object.keys(state.baseline), ...Object.keys(records)])) {
    if (stableJson(records[key]) === stableJson(state.baseline[key])) continue
    // Parent is the version actually displayed/edited, not a newer remote head.
    const parent = state.operations.find(item => item.id === state.selected[key] && item.key === key)
    await append(state, key, records[key] ?? null, parent ? [parent.id] : [])
  }
  state.baseline = structuredClone(records)
}
export async function receive(state: SyncState, envelope: Parameters<typeof open>[0]): Promise<void> {
  insert(state, await open(envelope, state.config.key, state.config.space))
}
export async function resolve(state: SyncState, key: string, choice: string): Promise<void> {
  const versions = heads(state, key)
  const selected = versions.find(item => item.id === choice)
  if (!selected || versions.length < 2) throw new Error('冲突已经变化，请重新查看。')
  await append(state, key, selected.value, versions.map(item => item.id))
  if (key.startsWith('ideas/')) for (const alternate of versions) {
    if (alternate.id === choice || !alternate.value || alternate.value.deletedAt) continue
    const id = `idea-sync-${alternate.id}`
    const forkKey = `ideas/${id}`
    if (!state.operations.some(item => item.key === forkKey)) await append(state, forkKey, { ...alternate.value, id, forkOf: key.slice(6), title: `${String(alternate.value.title ?? '').slice(0, 28)} · 另一条思路` }, [])
  }
}
