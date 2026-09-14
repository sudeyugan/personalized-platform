import { invoke } from '@tauri-apps/api/core'

export interface StorageStatus { directory: string; libraryExists: boolean; custom: boolean }
const isTauriRuntime = () => '__TAURI_INTERNALS__' in window

export const startupRepository = {
  async status(): Promise<StorageStatus> {
    if (!isTauriRuntime()) return { directory: '浏览器预览存储', libraryExists: true, custom: false }
    return invoke<StorageStatus>('get_storage_status')
  },
  async configure(directory: string): Promise<StorageStatus> {
    if (!isTauriRuntime()) return { directory: '浏览器预览存储', libraryExists: true, custom: false }
    return invoke<StorageStatus>('configure_storage', { directory })
  },
}
