import { invoke } from '@tauri-apps/api/core'

export const diagnosticRepository = {
  async create() {
    if (!('__TAURI_INTERNALS__' in window)) throw new Error('诊断包仅在 Windows 桌面版可用')
    return invoke<string>('create_diagnostic_bundle')
  },
}
