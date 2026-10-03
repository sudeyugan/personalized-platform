import { invoke } from '@tauri-apps/api/core'
import type { LibraryData } from '../domain/models'
import { formatLocalDate } from '../domain/localDate'

export interface BackupReceipt { path: string; createdAt: string; size: number; sha256: string; automatic: boolean; shared: boolean }
export interface BackupPreview { appVersion: string; createdAt: string; works: number; chapters: number; assets: number; encryptedVaults: number; checksumsValid: boolean }
const isTauriRuntime = () => '__TAURI_INTERNALS__' in window

export const backupRepository = {
  async create(directory = ''): Promise<BackupReceipt> {
    if (!isTauriRuntime()) throw new Error('完整备份仅在桌面版可用')
    return invoke('create_backup', { automatic: false, createdAt: new Date().toISOString(), directory })
  },
  async ensureAutomatic(retention: number, intervalDays = 3, directory = '') {
    if (!isTauriRuntime()) return null
    return invoke<BackupReceipt | null>('ensure_daily_backup', { retention, intervalDays, date: formatLocalDate(), createdAt: new Date().toISOString(), directory })
  },
  async list(directory = ''): Promise<BackupReceipt[]> { return isTauriRuntime() ? invoke('list_backups', { directory }) : [] },
  async previewSaved(path: string, directory = ''): Promise<BackupPreview> {
    if (!isTauriRuntime()) throw new Error('备份恢复仅在桌面版可用')
    return invoke('preview_saved_backup', { path, directory })
  },
  async restoreSaved(path: string, directory = '') {
    if (!isTauriRuntime()) throw new Error('备份恢复仅在桌面版可用')
    await invoke('restore_saved_backup', { path, directory })
  },
  async preview(file: File): Promise<BackupPreview> {
    if (!isTauriRuntime()) { const data = JSON.parse(await file.text()) as LibraryData; return { appVersion: 'browser', createdAt: '', works: data.works.length, chapters: Object.keys(data.chapters).length, assets: data.assets.length, encryptedVaults: data.works.filter((work) => work.encrypted).length, checksumsValid: true } }
    return invoke('preview_backup', { bytes: [...new Uint8Array(await file.arrayBuffer())] })
  },
  async restore(file: File, directory = '') {
    if (!isTauriRuntime()) throw new Error('完整恢复仅在桌面版可用')
    await invoke('restore_backup', { bytes: [...new Uint8Array(await file.arrayBuffer())], directory })
  },
}
