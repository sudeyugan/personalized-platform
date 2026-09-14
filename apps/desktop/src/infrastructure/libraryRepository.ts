import { invoke } from '@tauri-apps/api/core'
import type { LibraryData } from '../domain/models'
import { vaultRepository } from './vaultRepository'

const STORAGE_KEY = 'yiyu.library.preview.v1'
const RECOVERY_KEY = 'yiyu.recovery.drafts.v1'

function isTauriRuntime() { return '__TAURI_INTERNALS__' in window }

interface LibrarySnapshot { data: LibraryData; revision: number }
interface SaveReceipt { committedRevision: number }

export interface RecoveryDraft {
  chapterId: string
  content: LibraryData['chapters'][string]['content']
  plainText: string
  updatedAt: string
}

export interface SearchHit { chapterId: string; title: string; excerpt: string }

export interface HealthStatus {
  runtime: 'tauri' | 'browser'
  storage: 'ready' | 'unavailable'
  libraryPath?: string
}

export interface LibraryRepository {
  load(): Promise<LibraryData | null>
  save(data: LibraryData): Promise<void>
  health(): Promise<HealthStatus>
  saveDraft(draft: RecoveryDraft): Promise<void>
  loadDrafts(): Promise<RecoveryDraft[]>
  clearDraft(chapterId: string): Promise<void>
  search(query: string): Promise<SearchHit[]>
}

export class AppLibraryRepository implements LibraryRepository {
  private revision = 0
  private saveQueue: Promise<void> = Promise.resolve()

  async load(): Promise<LibraryData | null> {
    if (isTauriRuntime()) {
      const snapshot = await invoke<LibrarySnapshot | null>('load_library')
      this.revision = snapshot?.revision ?? 0
      return snapshot?.data ?? null
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as LibrarySnapshot | LibraryData
      if ('data' in parsed && 'revision' in parsed) {
        this.revision = parsed.revision
        return parsed.data
      }
      this.revision = 0
      return parsed
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
  }

  save(data: LibraryData): Promise<void> {
    const commit = async () => {
      const persistentData = await vaultRepository.sealForPersistence(data)
      if (isTauriRuntime()) {
        const receipt = await invoke<SaveReceipt>('save_library', { data: persistentData, expectedRevision: this.revision })
        this.revision = receipt.committedRevision
        return
      }
      this.revision += 1
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: persistentData, revision: this.revision }))
    }
    this.saveQueue = this.saveQueue.then(commit, commit)
    return this.saveQueue
  }

  async health(): Promise<HealthStatus> {
    if (isTauriRuntime()) return invoke<HealthStatus>('health_check')
    return { runtime: 'browser', storage: 'ready' }
  }

  async saveDraft(draft: RecoveryDraft): Promise<void> {
    if (isTauriRuntime()) return invoke('save_recovery_draft', { draft })
    const drafts = await this.loadDrafts()
    localStorage.setItem(RECOVERY_KEY, JSON.stringify([...drafts.filter((item) => item.chapterId !== draft.chapterId), draft]))
  }

  async loadDrafts(): Promise<RecoveryDraft[]> {
    if (isTauriRuntime()) return invoke<RecoveryDraft[]>('load_recovery_drafts')
    try { return JSON.parse(localStorage.getItem(RECOVERY_KEY) ?? '[]') as RecoveryDraft[] } catch { return [] }
  }

  async clearDraft(chapterId: string): Promise<void> {
    if (isTauriRuntime()) return invoke('clear_recovery_draft', { chapterId })
    const drafts = await this.loadDrafts()
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(drafts.filter((item) => item.chapterId !== chapterId)))
  }

  async search(query: string): Promise<SearchHit[]> {
    if (isTauriRuntime()) return invoke<SearchHit[]>('search_library', { query })
    const data = await this.load()
    const needle = query.trim().toLocaleLowerCase()
    if (!data || !needle) return []
    return Object.values(data.chapters)
      .filter((chapter) => !chapter.deletedAt && `${chapter.title}\n${chapter.plainText}`.toLocaleLowerCase().includes(needle))
      .slice(0, 30)
      .map((chapter) => ({ chapterId: chapter.id, title: chapter.title, excerpt: chapter.plainText.slice(0, 80) }))
  }
}

export const libraryRepository = new AppLibraryRepository()
