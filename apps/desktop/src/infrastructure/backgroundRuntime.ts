import { invoke } from '@tauri-apps/api/core'

export async function syncBackgroundRuntime(enabled: boolean) {
  if (!('__TAURI_INTERNALS__' in window)) return
  await invoke('set_background_wake_runtime', { enabled })
}
