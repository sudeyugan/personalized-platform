import type { Enrollment, SyncState } from './types'

const DB = 'yiyu-device-sync-v1'
export async function loadState(): Promise<SyncState | null> { return access('readonly', 'current') as Promise<SyncState | null> }
export async function saveState(value: SyncState | null): Promise<void> { await access('readwrite', 'current', value) }
export async function loadEnrollment(): Promise<Enrollment | null> { return access('readonly', 'enrollment') as Promise<Enrollment | null> }
export async function saveEnrollment(value: Enrollment | null): Promise<void> { await access('readwrite', 'enrollment', value) }
function access(mode: IDBTransactionMode, key: string, value?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DB, 1)
    opening.onupgradeneeded = () => { opening.result.createObjectStore('state') }
    opening.onerror = () => reject(new Error('本机同步存储不可用。'))
    opening.onsuccess = () => {
      const db = opening.result
      const transaction = db.transaction('state', mode)
      const store = transaction.objectStore('state')
      const request = mode === 'readonly' ? store.get(key) : value === null ? store.delete(key) : store.put(value, key)
      transaction.oncomplete = () => { db.close(); resolve(mode === 'readonly' ? request.result ?? null : undefined) }
      transaction.onabort = transaction.onerror = () => { db.close(); reject(new Error('本机同步事务失败；未发送待同步内容。')) }
    }
  })
}
