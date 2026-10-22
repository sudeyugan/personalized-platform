import { invoke } from '@tauri-apps/api/core'
import { fetchTransport, type Transport } from '@yiyu/sync'

// Signed configuration messages must retain their JSON field order across IPC.
// Rust validates the JSON, but transports the original text without reserializing it.
export const transport: Transport = async (url, path, token, body) => {
  if (!('__TAURI_INTERNALS__' in window)) return fetchTransport(url, path, token, body)
  const response = await invoke<string>('device_sync_request', {
    url,
    path,
    token,
    body: JSON.stringify(body),
  })
  return JSON.parse(response) as unknown
}
