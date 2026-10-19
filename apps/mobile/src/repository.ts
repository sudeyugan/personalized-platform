import { connect, fetchTransport, loadState, readPairing, saveEnrollment, saveState, SyncClient, validateRecords, type Records, type SyncState } from '@yiyu/sync'

let records: Records = {}
let client: SyncClient | null = null
let error = ''
let busy = false
let lastSync = ''
let activeEdit = false
let applying = false
let pendingWrites = 0
let writes: Promise<unknown> = Promise.resolve()
const listeners = new Set<() => void>()
let snapshot = { records, state: null as SyncState | null, error, busy, applying, lastSync }
function emit() { snapshot = { records, state: client?.state ?? null, error, busy, applying, lastSync }; for (const listener of listeners) listener() }
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const getSnapshot = () => snapshot
function local<T>(mode: IDBTransactionMode, value?: T): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('yiyu-mobile-library-v1', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('records')
    open.onerror = () => reject(new Error('手机本机资料无法打开。'))
    open.onsuccess = () => {
      const db = open.result, transaction = db.transaction('records', mode), store = transaction.objectStore('records')
      const request = mode === 'readonly' ? store.get('current') : store.put(value, 'current')
      transaction.oncomplete = () => { db.close(); resolve(mode === 'readonly' ? request.result ?? null : value ?? null) }
      transaction.onabort = transaction.onerror = () => { db.close(); reject(new Error('手机本机保存失败；请不要关闭页面。')) }
    }
  })
}
function install(state: SyncState) {
  client = new SyncClient(state, {
    read: () => records,
    persist: async next => { await saveState(next); emit() },
    transport: fetchTransport,
    apply: async next => {
      if (activeEdit || pendingWrites || JSON.stringify(records) !== JSON.stringify(client?.state.baseline)) return false
      validateRecords(next)
      applying = true; emit()
      try { await local('readwrite', next); records = next; emit(); return true }
      finally { applying = false; emit() }
    },
  })
  emit()
}
export async function initialize() {
  records = await local<Records>('readonly') ?? {}
  const state = await loadState()
  if (state) install(state)
  emit()
}
export async function join(raw: string, name: string) {
  if (client) throw new Error('手机已经连接，请勿重复加入。')
  const pairing = readPairing(raw)
  const state = await connect(pairing.url, pairing.invite, name, fetchTransport, pairing)
  await saveState(state)
  await saveEnrollment(null)
  install(state)
  await sync()
}
export function editMode(value: boolean) { activeEdit = value }
export async function update(key: string, value: Record<string, unknown> | null) {
  if (applying) throw new Error('正在应用刚收到的修改，请稍后再试。')
  pendingWrites++
  const job = async () => {
    try {
      const next = { ...records }
      if (value) next[key] = value; else delete next[key]
      validateRecords(next)
      await local('readwrite', next)
      records = next; emit()
      if (client) await client.capture(next)
      emit()
    } finally { pendingWrites-- }
  }
  const result = writes.then(job, job)
  writes = result.catch(() => undefined)
  return result
}
export async function resolveVersion(key: string, id: string) {
  await client?.resolve(key, id)
  emit(); await sync()
}
export async function sync() {
  if (!client || busy) return
  busy = true; error = ''; emit()
  try { await writes; await client.sync(); lastSync = new Date().toISOString() }
  catch (cause) { error = cause instanceof Error ? cause.message : '连接暂不可用；本机资料保留。' }
  finally { busy = false; emit() }
}
