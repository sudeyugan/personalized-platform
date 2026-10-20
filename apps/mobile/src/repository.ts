import {
  connect,
  fetchTransport,
  loadState,
  readPairing,
  saveEnrollment,
  saveState,
  SyncClient,
  validateRecords,
  type Records,
  type SyncState,
} from '@yiyu/sync'
import { mobileConfigHandoff } from './configHandoff'

let records: Records = {}
let client: SyncClient | null = null
let error = ''
let configError = ''
let busy = false
let lastSync = ''
let editHolds = 0
let applying = false
let pendingWrites = 0
let writes: Promise<unknown> = Promise.resolve()
const listeners = new Set<() => void>()
let snapshot = {
  records,
  configError,
  state: null as SyncState | null,
  error,
  busy,
  applying,
  lastSync,
}
function emit() {
  snapshot = {
    records,
    configError,
    state: client?.state ?? null,
    error,
    busy,
    applying,
    lastSync,
  }
  for (const listener of listeners) listener()
}
export const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const getSnapshot = () => snapshot
function local<T>(mode: IDBTransactionMode, value?: T): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('yiyu-mobile-library-v1', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('records')
    open.onerror = () => reject(new Error('手机本机资料无法打开。'))
    open.onsuccess = () => {
      const db = open.result,
        transaction = db.transaction('records', mode),
        store = transaction.objectStore('records')
      const request = mode === 'readonly' ? store.get('current') : store.put(value, 'current')
      transaction.oncomplete = () => {
        db.close()
        resolve(mode === 'readonly' ? (request.result ?? null) : (value ?? null))
      }
      transaction.onabort = transaction.onerror = () => {
        db.close()
        reject(new Error('手机本机保存失败；请不要关闭页面。'))
      }
    }
  })
}
function install(state: SyncState) {
  client = new SyncClient(state, {
    read: () => records,
    persist: async (next) => {
      await saveState(next)
      emit()
    },
    transport: fetchTransport,
    apply: async (next) => {
      if (
        editHolds ||
        pendingWrites ||
        JSON.stringify(records) !== JSON.stringify(client?.state.baseline)
      )
        return false
      validateRecords(next)
      applying = true
      emit()
      try {
        await local('readwrite', next)
        records = next
        emit()
        return true
      } finally {
        applying = false
        emit()
      }
    },
  })
  emit()
}
export async function initialize() {
  records = (await local<Records>('readonly')) ?? {}
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
export function holdEdits() {
  editHolds++
  let released = false
  return () => {
    if (!released) {
      editHolds--
      released = true
    }
  }
}
export async function changeRecords(change: (current: Records) => Records) {
  if (applying) throw new Error('正在应用刚收到的修改，请稍后再试。')
  pendingWrites++
  const job = async () => {
    try {
      const next = change(records)
      validateRecords(next)
      await local('readwrite', next)
      records = next
      emit()
      if (client) await client.capture(next)
      emit()
    } finally {
      pendingWrites--
    }
  }
  const result = writes.then(job, job)
  writes = result.catch(() => undefined)
  return result
}
export function update(key: string, value: Record<string, unknown> | null) {
  return changeRecords((current) => {
    const next = { ...current }
    if (value) next[key] = value
    else delete next[key]
    return next
  })
}
export function modify(
  key: string,
  change: (current: Record<string, unknown>) => Record<string, unknown>,
) {
  return changeRecords((current) => {
    if (!current[key] || current[key].deletedAt)
      throw new Error('这份记录已移走，没有覆盖或重新创建。')
    return { ...current, [key]: change(current[key]) }
  })
}
export async function resolveVersion(key: string, id: string) {
  await client?.resolve(key, id)
  emit()
  await sync()
}
export async function moveHub(url: string) {
  if (!client || busy) throw new Error('请先连接并等待本轮同步结束。')
  busy = true
  emit()
  try {
    await writes
    await client.moveEndpoint(url)
  } finally {
    busy = false
    emit()
  }
  await sync()
}
export async function sync() {
  if (!client || busy) return
  busy = true
  error = ''
  emit()
  try {
    await writes
    await client.sync()
    lastSync = new Date().toISOString()
    try { await mobileConfigHandoff(client.state.config)?.tick(); configError = '' }
    catch { configError = '资料已同步；配置交接暂未完成，请检查交接状态，并确认中枢已更新。' }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : '连接暂不可用；本机资料保留。'
  } finally {
    busy = false
    emit()
  }
}
