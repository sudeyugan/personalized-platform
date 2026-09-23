import type { CompanionPersonality, LibraryData } from '../domain/models'
import { libraryRepository } from '../infrastructure/libraryRepository'
import type { LibraryStore } from './libraryStoreTypes'

type SetStore = (partial: Partial<LibraryStore>) => void
const commit = (data: LibraryData, set: SetStore) => { set({ data }); void libraryRepository.save(data) }
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export function buildCompanionContext(data: LibraryData, temporaryWorkIds: string[]) {
  const permission = data.companion.permissions
  const chapter = data.chapters[data.session.activeChapterId]
  const work = data.works.find((item) => item.id === chapter?.workId)
  const workAllowed = Boolean(work && permission.workIds.includes(work.id))
  const chapterAllowed = Boolean(chapter && permission.chapterIds.includes(chapter.id))
  const encryptedAllowed = !work?.encrypted || (!work.locked && temporaryWorkIds.includes(work.id))
  const parts: string[] = []
  if (chapter && encryptedAllowed && (workAllowed || chapterAllowed)) parts.push(`章节片段：${chapter.plainText.slice(0, 1200)}`)
  if (permission.records) parts.push(`资料概览：人物 ${data.people.filter((item) => !item.deletedAt).length}，地点 ${data.places.filter((item) => !item.deletedAt).length}，事件 ${data.events.filter((item) => !item.deletedAt).length}`)
  if (permission.musicContext) { const track = data.tracks.find((item) => item.id === data.session.currentTrackId); if (track) parts.push(`正在播放：${track.title} / ${track.artist}`) }
  const memories = data.companion.memories.filter((memory) => {
    if (!memory.authorized) return false
    if (!memory.sourceWorkId) return true
    const sourceWork = data.works.find((item) => item.id === memory.sourceWorkId)
    const hasScope = permission.workIds.includes(memory.sourceWorkId) || permission.chapterIds.some((id) => data.chapters[id]?.workId === memory.sourceWorkId)
    return hasScope && (!sourceWork?.encrypted || temporaryWorkIds.includes(memory.sourceWorkId))
  })
  if (memories.length) parts.push(`已授权记忆：${memories.slice(-8).map((memory) => memory.content).join('；')}`)
  return { text: parts.join('\n'), summary: parts.length ? parts.map((part) => part.split('：')[0]).join('、') : '未授权任何上下文' }
}

export function createCompanionSlice(get: () => LibraryStore, set: SetStore): Pick<LibraryStore, 'setCompanionProfile' | 'setCompanionAppearance' | 'setCompanionDesktop' | 'setCompanionDesktopMode' | 'setCompanionShortcut' | 'setCompanionQuietShortcut' | 'setCompanionPortrait' | 'setCompanionVideo' | 'addCompanionVideo' | 'removeCompanionVideo' | 'setCompanionProvider' | 'setCompanionVoice' | 'setCompanionPermissions' | 'grantTemporaryCompanionWork' | 'addCompanionMessage' | 'addCompanionAudit' | 'clearCompanionMessages' | 'addCompanionMemory' | 'updateCompanionMemory' | 'deleteCompanionMemory' | 'setCompanionGrowthEnabled' | 'setCompanionPersonality' | 'rollbackCompanionGrowth' | 'resetCompanionPersonality'> {
  const updatePersonality = (changes: Partial<CompanionPersonality>, reason: string) => {
    const current = get().data
    const before = current.companion.personality
    const after = { warmth: clamp(changes.warmth ?? before.warmth), curiosity: clamp(changes.curiosity ?? before.curiosity), initiative: clamp(changes.initiative ?? before.initiative) }
    if (Object.keys(before).every((key) => before[key as keyof CompanionPersonality] === after[key as keyof CompanionPersonality])) return
    const log = { id: `growth-${crypto.randomUUID()}`, before, after, reason, createdAt: new Date().toISOString() }
    commit({ ...current, companion: { ...current.companion, personality: after, growth: { ...current.companion.growth, logs: [...current.companion.growth.logs, log].slice(-100) } } }, set)
  }
  return {
    setCompanionProfile: (changes) => { const current = get().data; commit({ ...current, companion: { ...current.companion, ...changes } }, set) },
    setCompanionAppearance: (changes) => { const current = get().data; commit({ ...current, companion: { ...current.companion, appearance: { ...current.companion.appearance, ...changes } } }, set) },
    setCompanionDesktop: (visible) => { const current = get().data; commit({ ...current, companion: { ...current.companion, desktop: { ...current.companion.desktop, visible } } }, set) },
    setCompanionDesktopMode: (mode) => { const current = get().data; commit({ ...current, companion: { ...current.companion, desktop: { ...current.companion.desktop, mode } } }, set) },
    setCompanionShortcut: (toggleShortcut) => { const current = get().data; commit({ ...current, companion: { ...current.companion, desktop: { ...current.companion.desktop, toggleShortcut } } }, set) },
    setCompanionQuietShortcut: (quietShortcut) => { const current = get().data; commit({ ...current, companion: { ...current.companion, desktop: { ...current.companion.desktop, quietShortcut } } }, set) },
    setCompanionPortrait: (assetId) => { const current = get().data; commit({ ...current, companion: { ...current.companion, appearance: { ...current.companion.appearance, portraitAssetId: assetId }, desktop: { ...current.companion.desktop, visual: { type: 'portrait', assetId } } } }, set) },
    setCompanionVideo: (state, assetId) => {
      const current = get().data
      const clips = { ...(current.companion.desktop.videoClips ?? {}) }
      if (assetId) clips[state] = [assetId]
      else delete clips[state]
      const videos = Object.fromEntries(Object.entries(clips).flatMap(([key, ids]) => ids?.[0] ? [[key, ids[0]]] : []))
      const visual = videos.idle
        ? { type: 'video' as const, videos, clips }
        : current.companion.desktop.visual.type === 'video'
          ? { type: 'portrait' as const, assetId: current.companion.appearance.portraitAssetId }
          : current.companion.desktop.visual
      commit({ ...current, companion: { ...current.companion, desktop: { ...current.companion.desktop, videoAssets: videos, videoClips: clips, visual } } }, set)
    },
    addCompanionVideo: (state, assetId) => {
      const current = get().data
      const clips = { ...(current.companion.desktop.videoClips ?? {}) }
      clips[state] = [...new Set([...(clips[state] ?? []), assetId])]
      const videos = Object.fromEntries(Object.entries(clips).flatMap(([key, ids]) => ids?.[0] ? [[key, ids[0]]] : []))
      commit({ ...current, companion: { ...current.companion, desktop: { ...current.companion.desktop, videoAssets: videos, videoClips: clips, visual: clips.idle?.length ? { type: 'video', videos, clips } : current.companion.desktop.visual } } }, set)
    },
    removeCompanionVideo: (state, assetId) => {
      const current = get().data
      const clips = { ...(current.companion.desktop.videoClips ?? {}) }
      const remaining = (clips[state] ?? []).filter((id) => id !== assetId)
      if (remaining.length) clips[state] = remaining
      else delete clips[state]
      const videos = Object.fromEntries(Object.entries(clips).flatMap(([key, ids]) => ids?.[0] ? [[key, ids[0]]] : []))
      const visual = clips.idle?.length ? { type: 'video' as const, videos, clips } : { type: 'portrait' as const, assetId: current.companion.appearance.portraitAssetId }
      commit({ ...current, companion: { ...current.companion, desktop: { ...current.companion.desktop, videoAssets: videos, videoClips: clips, visual } } }, set)
    },
    setCompanionProvider: (changes) => { const current = get().data; commit({ ...current, companion: { ...current.companion, provider: { ...current.companion.provider, ...changes } } }, set) },
    setCompanionVoice: (changes) => {
      const current = get().data
      const voice = current.companion.voice
      commit({ ...current, companion: { ...current.companion, voice: { ...voice, ...changes, stt: { ...voice.stt, ...changes.stt }, tts: { ...voice.tts, ...changes.tts } } } }, set)
    },
    setCompanionPermissions: (changes) => { const current = get().data; commit({ ...current, companion: { ...current.companion, permissions: { ...current.companion.permissions, ...changes } } }, set) },
    grantTemporaryCompanionWork: (id, allowed) => set({ temporaryCompanionWorkIds: allowed ? [...new Set([...get().temporaryCompanionWorkIds, id])] : get().temporaryCompanionWorkIds.filter((item) => item !== id) }),
    addCompanionMessage: (message) => { const current = get().data; commit({ ...current, companion: { ...current.companion, messages: [...current.companion.messages, message].slice(-100) } }, set); if (message.role === 'companion' && current.companion.growth.enabled) updatePersonality({ warmth: current.companion.personality.warmth + 1, curiosity: current.companion.personality.curiosity + 1 }, '已授权的对话互动') },
    addCompanionAudit: (entries) => { if (!entries.length) return; const current = get().data; commit({ ...current, companion: { ...current.companion, agentAudit: [...current.companion.agentAudit, ...entries].slice(-300) } }, set) },
    clearCompanionMessages: () => { const current = get().data; commit({ ...current, companion: { ...current.companion, messages: [] } }, set) },
    addCompanionMemory: (content, source, sourceLabel, sourceWorkId) => { const current = get().data; if (!content.trim() || (sourceWorkId && current.works.find((item) => item.id === sourceWorkId)?.encrypted)) return false; const now = new Date().toISOString(); const memory = { id: `memory-${crypto.randomUUID()}`, content: content.trim(), source, sourceLabel, sourceWorkId, createdAt: now, updatedAt: now, confidence: source === 'manual' ? 100 : 70, authorized: true }; commit({ ...current, companion: { ...current.companion, memories: [...current.companion.memories, memory] } }, set); return true },
    updateCompanionMemory: (id, changes) => { const current = get().data; commit({ ...current, companion: { ...current.companion, memories: current.companion.memories.map((memory) => memory.id === id ? { ...memory, ...changes, confidence: changes.confidence === undefined ? memory.confidence : clamp(changes.confidence), updatedAt: new Date().toISOString() } : memory) } }, set) },
    deleteCompanionMemory: (id) => { const current = get().data; commit({ ...current, companion: { ...current.companion, memories: current.companion.memories.filter((memory) => memory.id !== id) } }, set) },
    setCompanionGrowthEnabled: (enabled) => { const current = get().data; commit({ ...current, companion: { ...current.companion, growth: { ...current.companion.growth, enabled } } }, set) },
    setCompanionPersonality: updatePersonality,
    rollbackCompanionGrowth: (id) => { const current = get().data; const log = current.companion.growth.logs.find((item) => item.id === id); if (log) updatePersonality(log.before, `回退：${log.reason}`) },
    resetCompanionPersonality: () => updatePersonality({ warmth: 60, curiosity: 50, initiative: 30 }, '重置为初始性格'),
  }
}
