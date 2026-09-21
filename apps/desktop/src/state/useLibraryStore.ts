import type { JSONContent } from '@tiptap/react'
import { create } from 'zustand'
import type { LibraryData } from '../domain/models'
import { createSeedLibrary, normalizeLibrary } from '../domain/seed'
import { countChineseWords } from '../domain/wordCount'
import { libraryRepository, type RecoveryDraft } from '../infrastructure/libraryRepository'
import type { LibraryStore } from './libraryStoreTypes'
import { createRecordsSlice } from './recordsSlice'
import { createAssetsSlice } from './assetsSlice'
import { backupRepository } from '../infrastructure/backupRepository'
import { createSecuritySlice } from './securitySlice'
import { createMusicSlice, resolvePlaybackContext } from './musicSlice'
import { createCompanionSlice } from './companionSlice'
import { createPlannerSlice } from './plannerSlice'
import { createAnswerBookSlice } from './answerBookSlice'
import { formatLocalDate } from '../domain/localDate'

const initialData = createSeedLibrary()

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export function retainVersions<T extends { pinned: boolean }>(versions: T[]) {
  const automatic = versions.filter((version) => !version.pinned).slice(-100)
  const retained = new Set(automatic)
  return versions.filter((version) => version.pinned || retained.has(version))
}

async function persist(data: LibraryData) {
  await libraryRepository.save(data)
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  data: initialData,
  ready: false,
  saveStatus: 'idle',
  health: null,
  recoveryDrafts: {},
  playback: { playing: false, context: 'global', queue: [] },
  temporaryCompanionWorkIds: [],

  hydrate: async () => {
    try {
      const [stored, health, drafts] = await Promise.all([libraryRepository.load(), libraryRepository.health(), libraryRepository.loadDrafts()])
      let data = stored?.schemaVersion === 1 ? normalizeLibrary(stored) : createSeedLibrary()
      const [context, queue] = resolvePlaybackContext(data)
      const localDate = formatLocalDate()
      await persist(data)
      set({
        data,
        health,
        ready: true,
        recoveryDrafts: Object.fromEntries(drafts.map((draft) => [draft.chapterId, draft])),
        playback: { playing: false, context, queue },
      })
      if (data.settings.backup.dailyEnabled && health.runtime === 'tauri') void backupRepository.ensureDaily(data.settings.backup.retentionCount, data.settings.backup.directory).then(async () => {
        const current = get().data
        const updated = { ...current, settings: { ...current.settings, backup: { ...current.settings.backup, lastAutomaticDate: localDate, lastAutomaticError: undefined } } }
        set({ data: updated }); await persist(updated)
      }).catch(async (error) => {
        const current = get().data
        const updated = { ...current, settings: { ...current.settings, backup: { ...current.settings.backup, lastAutomaticError: error instanceof Error ? error.message : '自动备份失败' } } }
        set({ data: updated }); await persist(updated)
      })
    } catch {
      set({
        data: initialData,
        health: { runtime: '__TAURI_INTERNALS__' in window ? 'tauri' : 'browser', storage: 'unavailable' },
        ready: true,
        saveStatus: 'error',
      })
    }
  },

  navigate: (activeView) => {
    const data = { ...get().data, session: { ...get().data.session, activeView } }
    set({ data })
    void persist(data)
  },

  selectWork: (activeWorkId) => {
    const work = get().data.works.find((item) => item.id === activeWorkId)
    if (!work) return
    const activeChapterId = work.chapterIds[0] ?? ''
    const openChapterIds = activeChapterId ? [activeChapterId] : []
    const data = { ...get().data, session: { ...get().data.session, activeWorkId, activeChapterId, openChapterIds } }
    set({ data })
    void persist(data)
  },

  selectChapter: (activeChapterId) => {
    const session = get().data.session
    const openChapterIds = session.openChapterIds.includes(activeChapterId)
      ? session.openChapterIds
      : [...session.openChapterIds, activeChapterId]
    const data = { ...get().data, session: { ...session, activeView: 'writing' as const, activeChapterId, openChapterIds } }
    set({ data })
    void persist(data)
  },

  closeChapter: (chapterId) => {
    const session = get().data.session
    const openChapterIds = session.openChapterIds.filter((item) => item !== chapterId)
    const activeChapterId = session.activeChapterId === chapterId
      ? openChapterIds.at(-1) ?? ''
      : session.activeChapterId
    const data = { ...get().data, session: { ...session, activeChapterId, openChapterIds } }
    set({ data })
    void persist(data)
  },

  createWork: () => {
    const now = new Date().toISOString()
    const workId = id('work')
    const chapterId = id('chapter')
    const emptyContent: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }
    const data: LibraryData = {
      ...get().data,
      works: [...get().data.works, { id: workId, kind: 'memoir', title: '未命名作品', description: '一段新的故事', chapterIds: [chapterId], targetWords: 50000, createdAt: now, updatedAt: now }],
      chapters: { ...get().data.chapters, [chapterId]: { id: chapterId, workId, title: '第一章', content: emptyContent, plainText: '', wordCount: 0, revision: 0, status: 'draft', versions: [], updatedAt: now } },
      session: { ...get().data.session, activeView: 'writing', activeWorkId: workId, activeChapterId: chapterId, openChapterIds: [chapterId] },
    }
    set({ data })
    void persist(data)
  },

  renameWork: (workId, title) => {
    if (!title.trim()) return
    const current = get().data
    const data = { ...current, works: current.works.map((work) => work.id === workId ? { ...work, title: title.trim(), updatedAt: new Date().toISOString() } : work) }
    set({ data }); void persist(data)
  },

  trashWork: (workId) => {
    const current = get().data
    const works = current.works.map((work) => work.id === workId ? { ...work, deletedAt: new Date().toISOString() } : work)
    const next = works.find((work) => !work.deletedAt)
    if (!next) return
    const activeChapterId = next.chapterIds.find((chapterId) => !current.chapters[chapterId]?.deletedAt) ?? ''
    const data = { ...current, works, session: { ...current.session, activeWorkId: next.id, activeChapterId, openChapterIds: activeChapterId ? [activeChapterId] : [] } }
    set({ data }); void persist(data)
  },

  createChapter: () => {
    const current = get().data
    const work = current.works.find((item) => item.id === current.session.activeWorkId)
    if (!work) return
    const chapterId = id('chapter')
    const now = new Date().toISOString()
    const volumeId = work.volumeIds?.at(-1)
    const data: LibraryData = {
      ...current,
      works: current.works.map((item) => item.id === work.id ? { ...item, chapterIds: [...item.chapterIds, chapterId], updatedAt: now } : item),
      volumes: current.volumes.map((volume) => volume.id === volumeId ? { ...volume, chapterIds: [...volume.chapterIds, chapterId], updatedAt: now } : volume),
      chapters: { ...current.chapters, [chapterId]: { id: chapterId, workId: work.id, volumeId, title: `第 ${work.chapterIds.length + 1} 章`, content: { type: 'doc', content: [{ type: 'paragraph' }] }, plainText: '', wordCount: 0, revision: 0, status: 'draft', versions: [], updatedAt: now } },
      session: { ...current.session, activeChapterId: chapterId, openChapterIds: [...current.session.openChapterIds, chapterId] },
    }
    set({ data })
    void persist(data)
  },

  importChapters: (workId, imported) => {
    const current = get().data; const work = current.works.find((item) => item.id === workId); if (!work || imported.length === 0) return
    const now = new Date().toISOString(); const chapters = { ...current.chapters }; const newIds: string[] = []
    imported.forEach((item) => { const chapterId = id('chapter'); const wordCount = countChineseWords(item.plainText); newIds.push(chapterId); chapters[chapterId] = { id: chapterId, workId, title: item.title, content: item.content, plainText: item.plainText, wordCount, revision: 1, status: 'draft', versions: [{ id: id('version'), revision: 1, content: item.content, plainText: item.plainText, wordCount, reason: 'initial', label: '导入版本', pinned: true, createdAt: now }], updatedAt: now } })
    const data = { ...current, chapters, works: current.works.map((item) => item.id === workId ? { ...item, chapterIds: [...item.chapterIds, ...newIds], updatedAt: now } : item), session: { ...current.session, activeWorkId: workId, activeChapterId: newIds[0], openChapterIds: [newIds[0]], activeView: 'writing' as const } }; set({ data }); void persist(data)
  },

  createVolume: () => {
    const current = get().data
    const work = current.works.find((item) => item.id === current.session.activeWorkId)
    if (!work) return
    const volumeId = id('volume')
    const now = new Date().toISOString()
    const data: LibraryData = {
      ...current,
      volumes: [...current.volumes, { id: volumeId, workId: work.id, title: `新卷 ${current.volumes.filter((item) => item.workId === work.id).length + 1}`, chapterIds: [], createdAt: now, updatedAt: now }],
      works: current.works.map((item) => item.id === work.id ? { ...item, volumeIds: [...(item.volumeIds ?? []), volumeId] } : item),
    }
    set({ data }); void persist(data)
  },

  renameVolume: (volumeId, title) => {
    if (!title.trim()) return
    const current = get().data
    const data = { ...current, volumes: current.volumes.map((volume) => volume.id === volumeId ? { ...volume, title: title.trim(), updatedAt: new Date().toISOString() } : volume) }
    set({ data }); void persist(data)
  },

  trashVolume: (volumeId) => {
    const current = get().data
    const data = { ...current, volumes: current.volumes.map((volume) => volume.id === volumeId ? { ...volume, deletedAt: new Date().toISOString() } : volume) }
    set({ data }); void persist(data)
  },

  moveChapter: (chapterId, direction) => {
    const current = get().data
    const chapter = current.chapters[chapterId]
    const work = current.works.find((item) => item.id === chapter?.workId)
    if (!chapter || !work) return
    const chapterIds = work.chapterIds.filter((item) => !current.chapters[item]?.deletedAt)
    const index = chapterIds.indexOf(chapterId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= chapterIds.length) return
    ;[chapterIds[index], chapterIds[target]] = [chapterIds[target], chapterIds[index]]
    const deleted = work.chapterIds.filter((item) => current.chapters[item]?.deletedAt)
    const data = { ...current, works: current.works.map((item) => item.id === work.id ? { ...item, chapterIds: [...chapterIds, ...deleted] } : item) }
    set({ data }); void persist(data)
  },

  reorderChapter: (sourceId, targetId) => {
    if (sourceId === targetId) return
    const current = get().data
    const chapter = current.chapters[sourceId]
    const work = current.works.find((item) => item.id === chapter?.workId)
    if (!chapter || !work || current.chapters[targetId]?.workId !== work.id) return
    const chapterIds = [...work.chapterIds]
    const source = chapterIds.indexOf(sourceId)
    const target = chapterIds.indexOf(targetId)
    if (source < 0 || target < 0) return
    chapterIds.splice(target, 0, chapterIds.splice(source, 1)[0])
    const data = { ...current, works: current.works.map((item) => item.id === work.id ? { ...item, chapterIds, updatedAt: new Date().toISOString() } : item) }
    set({ data }); void persist(data)
  },

  trashChapter: (chapterId) => {
    const current = get().data
    const chapter = current.chapters[chapterId]
    if (!chapter) return
    const chapters = { ...current.chapters, [chapterId]: { ...chapter, deletedAt: new Date().toISOString() } }
    const openChapterIds = current.session.openChapterIds.filter((item) => item !== chapterId)
    const activeChapterId = current.session.activeChapterId === chapterId ? openChapterIds[0] ?? '' : current.session.activeChapterId
    const data = { ...current, chapters, session: { ...current.session, openChapterIds, activeChapterId } }
    set({ data }); void persist(data)
  },

  restoreChapter: (chapterId) => {
    const current = get().data
    const chapter = current.chapters[chapterId]
    if (!chapter) return
    const { deletedAt: _, ...restored } = chapter
    const data = { ...current, chapters: { ...current.chapters, [chapterId]: restored } }
    set({ data }); void persist(data)
  },

  permanentlyDeleteChapter: (chapterId) => {
    const current = get().data
    if (!current.chapters[chapterId]?.deletedAt) return
    const chapters = { ...current.chapters }
    delete chapters[chapterId]
    const data = { ...current, chapters, works: current.works.map((work) => ({ ...work, chapterIds: work.chapterIds.filter((id) => id !== chapterId) })), volumes: current.volumes.map((volume) => ({ ...volume, chapterIds: volume.chapterIds.filter((id) => id !== chapterId) })) }
    set({ data }); void persist(data); void libraryRepository.clearDraft(chapterId)
  },

  renameChapter: (chapterId, title) => {
    const current = get().data
    const chapter = current.chapters[chapterId]
    if (!chapter || !title.trim()) return
    const data = { ...current, chapters: { ...current.chapters, [chapterId]: { ...chapter, title: title.trim(), updatedAt: new Date().toISOString() } } }
    set({ data })
    void persist(data)
  },

  saveChapter: async (chapterId, content, plainText) => {
    const current = get().data
    const chapter = current.chapters[chapterId]
    if (!chapter) return
    set({ saveStatus: 'saving' })
    const revision = chapter.revision + 1
    const now = new Date().toISOString()
    const shouldSnapshot = revision === 1 || revision % 10 === 0
    const versions = shouldSnapshot
      ? retainVersions([...chapter.versions, { id: id('version'), revision, content, plainText, wordCount: countChineseWords(plainText), reason: 'automatic' as const, pinned: false, createdAt: now }])
      : chapter.versions
    const data = { ...current, chapters: { ...current.chapters, [chapterId]: { ...chapter, content, plainText, wordCount: countChineseWords(plainText), revision, versions, updatedAt: now } } }
    try {
      await persist(data)
      await libraryRepository.clearDraft(chapterId)
      set({ data, saveStatus: 'saved' })
      set((state) => { const recoveryDrafts = { ...state.recoveryDrafts }; delete recoveryDrafts[chapterId]; return { recoveryDrafts } })
    } catch {
      set({ saveStatus: 'error' })
    }
  },

  createManualVersion: async (chapterId) => {
    const current = get().data
    const chapter = current.chapters[chapterId]
    if (!chapter) return
    const version = { id: id('version'), revision: chapter.revision, content: chapter.content, plainText: chapter.plainText, wordCount: chapter.wordCount, reason: 'manual' as const, label: `手动版本 ${chapter.versions.length + 1}`, pinned: true, createdAt: new Date().toISOString() }
    const data = { ...current, chapters: { ...current.chapters, [chapterId]: { ...chapter, versions: [...chapter.versions, version] } } }
    await persist(data)
    set({ data, saveStatus: 'saved' })
  },

  restoreVersion: async (chapterId, versionId) => {
    const current = get().data
    const chapter = current.chapters[chapterId]
    const source = chapter?.versions.find((version) => version.id === versionId)
    if (!chapter || !source) return
    await get().saveChapter(chapterId, source.content, source.plainText)
  },

  toggleVersionPinned: (chapterId, versionId) => {
    const current = get().data
    const chapter = current.chapters[chapterId]
    if (!chapter) return
    const versions = chapter.versions.map((version) => version.id === versionId ? { ...version, pinned: !version.pinned } : version)
    const data = { ...current, chapters: { ...current.chapters, [chapterId]: { ...chapter, versions } } }
    set({ data }); void persist(data)
  },

  ...createRecordsSlice(get, set),
  ...createAssetsSlice(get, set),
  ...createSecuritySlice(get, set),
  ...createMusicSlice(get, set),
  ...createCompanionSlice(get, set),
  ...createPlannerSlice(get, set),
  ...createAnswerBookSlice(get, set),

  setTheme: (theme) => {
    const data = { ...get().data, settings: { ...get().data.settings, theme } }
    set({ data })
    void persist(data)
  },

  toggleRightPanel: () => {
    const data = { ...get().data, settings: { ...get().data.settings, showRightPanel: !get().data.settings.showRightPanel } }
    set({ data })
    void persist(data)
  },

  setDailyTarget: (dailyTarget) => {
    const data = { ...get().data, settings: { ...get().data.settings, dailyTarget: Math.max(0, dailyTarget) } }
    set({ data })
    void persist(data)
  },

  setLayoutProfile: (layoutProfile) => {
    const showRightPanel = layoutProfile === 'minimal' ? false : get().data.settings.showRightPanel
    const data = { ...get().data, settings: { ...get().data.settings, layoutProfile, showRightPanel } }
    set({ data }); void persist(data)
  },

  setBackgroundImage: (backgroundImage) => {
    const data = { ...get().data, settings: { ...get().data.settings, backgroundImage } }
    set({ data }); void persist(data)
  },

  setAiSettings: (changes) => { const current = get().data; const data = { ...current, settings: { ...current.settings, ai: { ...current.settings.ai, ...changes } } }; set({ data }); void persist(data) },
  setBackupSettings: (changes) => { const current = get().data; const data = { ...current, settings: { ...current.settings, backup: { ...current.settings.backup, ...changes } } }; set({ data }); void persist(data) },
  setSecuritySettings: (changes) => { const current = get().data; const data = { ...current, settings: { ...current.settings, security: { ...current.settings.security, ...changes } } }; set({ data }); void persist(data) },
  moveNavigation: (view, direction) => {
    const current = get().data
    const navigationOrder = [...current.settings.navigationOrder]
    const index = navigationOrder.indexOf(view)
    const target = index + direction
    if (index < 0 || target < 0 || target >= navigationOrder.length) return
    ;[navigationOrder[index], navigationOrder[target]] = [navigationOrder[target], navigationOrder[index]]
    const data = { ...current, settings: { ...current.settings, navigationOrder } }
    set({ data }); void persist(data)
  },

  toggleModule: (moduleId) => {
    const current = get().data
    const module = current.settings.modules.find((item) => item.id === moduleId)
    if (!module?.available) return
    const modules = current.settings.modules.map((item) => item.id === moduleId ? { ...item, enabled: !item.enabled } : item)
    const hidesActiveView = module.enabled && (
      (moduleId === 'writing' && ['writing', 'diary', 'people', 'places', 'timeline', 'assets'].includes(current.session.activeView))
      || (moduleId === 'music' && current.session.activeView === 'music')
      || (moduleId === 'answerBook' && current.session.activeView === 'answerBook')
    )
    const session = hidesActiveView
      ? { ...current.session, activeView: 'home' as const }
      : current.session
    const data = { ...current, settings: { ...current.settings, modules }, session }
    set({ data }); void persist(data)
  },

  toggleFocusMode: () => {
    const data = { ...get().data, session: { ...get().data.session, focusMode: !get().data.session.focusMode } }
    set({ data }); void persist(data)
  },

  updateChapterSession: (chapterId, cursor, scroll) => {
    const current = get().data
    const data = { ...current, session: { ...current.session, cursorByChapter: { ...current.session.cursorByChapter, [chapterId]: cursor }, scrollByChapter: { ...current.session.scrollByChapter, [chapterId]: scroll } } }
    set({ data }); void persist(data)
  },

  saveRecoveryDraft: async (chapterId, content, plainText) => {
    const work = get().data.works.find((item) => item.id === get().data.chapters[chapterId]?.workId)
    if (work?.encrypted) { await persist(get().data); return }
    const draft: RecoveryDraft = { chapterId, content, plainText, updatedAt: new Date().toISOString() }
    set((state) => ({ recoveryDrafts: { ...state.recoveryDrafts, [chapterId]: draft } }))
    await libraryRepository.saveDraft(draft)
  },

  restoreRecoveryDraft: (chapterId) => {
    const draft = get().recoveryDrafts[chapterId]
    const chapter = get().data.chapters[chapterId]
    if (!draft || !chapter) return
    const data = { ...get().data, chapters: { ...get().data.chapters, [chapterId]: { ...chapter, content: draft.content, plainText: draft.plainText } } }
    set({ data })
  },

  discardRecoveryDraft: async (chapterId) => {
    await libraryRepository.clearDraft(chapterId)
    set((state) => { const recoveryDrafts = { ...state.recoveryDrafts }; delete recoveryDrafts[chapterId]; return { recoveryDrafts } })
  },
}))
