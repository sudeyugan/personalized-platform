import { libraryRepository } from '../infrastructure/libraryRepository'
import { sanitizeEncryptedWork, vaultRepository } from '../infrastructure/vaultRepository'
import type { LibraryStore } from './libraryStoreTypes'

type SetStore = (partial: Partial<LibraryStore> | ((state: LibraryStore) => Partial<LibraryStore>)) => void
export function createSecuritySlice(get: () => LibraryStore, set: SetStore): Pick<LibraryStore, 'encryptWork' | 'unlockWork' | 'lockWork' | 'lockAllWorks' | 'refreshVaultLocks'> {
  return {
    encryptWork: async (workId, password) => { const current = get().data; const chapters = Object.values(current.chapters).filter((chapter) => chapter.workId === workId); set({ saveStatus: 'saving' }); try { for (const chapter of chapters) await libraryRepository.clearDraft(chapter.id); const data = await vaultRepository.create(current, workId, password, current.settings.security.autoLockMinutes); set((state) => ({ data, recoveryDrafts: Object.fromEntries(Object.entries(state.recoveryDrafts).filter(([id]) => !chapters.some((chapter) => chapter.id === id))), saveStatus: 'saved' })); await libraryRepository.save(data) } catch (error) { set({ saveStatus: 'error' }); throw error } },
    unlockWork: async (workId, password) => { const data = await vaultRepository.unlock(get().data, workId, password, get().data.settings.security.autoLockMinutes); set({ data, saveStatus: 'saved' }) },
    lockWork: async (workId) => { const current = get().data; await libraryRepository.save(current); const data = await vaultRepository.lock(current, workId); set({ data, temporaryCompanionWorkIds: get().temporaryCompanionWorkIds.filter((id) => id !== workId), saveStatus: 'saved' }) },
    lockAllWorks: async () => { const current = get().data; if (!current.works.some((work) => work.encrypted && !work.locked)) return; await libraryRepository.save(current); set({ data: await vaultRepository.lockAll(current), temporaryCompanionWorkIds: [], saveStatus: 'saved' }) },
    refreshVaultLocks: async () => { let data = get().data; let changed = false; for (const work of data.works.filter((item) => item.encrypted && !item.locked && item.vaultId)) { if (!await vaultRepository.isUnlocked(work.vaultId!)) { data = sanitizeEncryptedWork(data, work.id); changed = true } } if (changed) set({ data, temporaryCompanionWorkIds: [] }) },
  }
}
