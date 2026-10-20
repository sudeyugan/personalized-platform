/** Separate from ordinary Records, backup projection and chat. Contains no plaintext API key. */
export async function configLocal<T>(key: string, value?: T): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('yiyu-config-handoff-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('local')
    request.onerror = () => reject(new Error('无法保存配置交接状态。'))
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('local', value === undefined ? 'readonly' : 'readwrite')
      const operation =
        value === undefined
          ? transaction.objectStore('local').get(key)
          : transaction.objectStore('local').put(value, key)
      transaction.oncomplete = () => {
        resolve(value === undefined ? (operation.result as T | undefined) : value)
        db.close()
      }
      transaction.onabort = transaction.onerror = () => {
        reject(new Error('配置状态未保存，未继续交接。'))
        db.close()
      }
    }
  })
}
