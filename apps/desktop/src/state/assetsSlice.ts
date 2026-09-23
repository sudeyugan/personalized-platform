import type { JSONContent } from '@tiptap/react'
import type { AiGeneration, CharacterSpriteReference, LibraryData } from '../domain/models'
import { assetRepository } from '../infrastructure/assetRepository'
import { libraryRepository } from '../infrastructure/libraryRepository'
import type { LibraryStore } from './libraryStoreTypes'

type SetStore = (partial: Partial<LibraryStore>) => void
const commit = (data: LibraryData, set: SetStore) => { set({ data }); void libraryRepository.save(data) }
const characterSpriteAssetId = (sprite: CharacterSpriteReference) => typeof sprite === 'string' ? sprite : sprite.assetId

export function createAssetsSlice(get: () => LibraryStore, set: SetStore): Pick<LibraryStore, 'importAsset' | 'importCompanionVideo' | 'updateAsset' | 'trashAsset' | 'restoreAsset' | 'permanentlyDeleteAsset' | 'linkAssetToChapter' | 'setChapterImpression' | 'recordAiGeneration'> {
  return {
    importAsset: async (file, context) => {
      const asset = await assetRepository.importImage(file, context)
      const current = get().data
      commit({ ...current, assets: [...current.assets, asset] }, set)
      return asset
    },
    importCompanionVideo: async (file, onProgress) => {
      const asset = await assetRepository.importCompanionVideo(file, onProgress)
      const current = get().data
      commit({ ...current, assets: [...current.assets, asset] }, set)
      return asset
    },
    updateAsset: (id, changes) => { const current = get().data; commit({ ...current, assets: current.assets.map((asset) => asset.id === id ? { ...asset, ...changes } : asset) }, set) },
    trashAsset: (id) => { const current = get().data; commit({ ...current, assets: current.assets.map((asset) => asset.id === id ? { ...asset, deletedAt: new Date().toISOString() } : asset) }, set) },
    restoreAsset: (id) => { const current = get().data; commit({ ...current, assets: current.assets.map((asset) => asset.id === id ? { ...asset, deletedAt: undefined } : asset) }, set) },
    permanentlyDeleteAsset: async (id) => {
      const current = get().data; const asset = current.assets.find((item) => item.id === id); if (!asset) return
      await assetRepository.delete(asset)
      const visual = current.companion.desktop.visual
      const clearsPortrait = visual.type === 'portrait' && visual.assetId === id
      const clips = Object.fromEntries(Object.entries(current.companion.desktop.videoClips ?? (visual.type === 'video' ? visual.clips : {}) ?? {}).flatMap(([state, assetIds]) => {
        const remaining = assetIds.filter((assetId) => assetId !== id)
        return remaining.length ? [[state, remaining]] : []
      }))
      const videos = Object.fromEntries(Object.entries(clips).flatMap(([state, assetIds]) => assetIds[0] ? [[state, assetIds[0]]] : []))
      const companion = clearsPortrait
        ? { ...current.companion, appearance: { ...current.companion.appearance, portraitAssetId: undefined }, desktop: { ...current.companion.desktop, visual: { type: 'portrait' as const } } }
        : { ...current.companion, desktop: { ...current.companion.desktop, videoAssets: videos, videoClips: clips, visual: visual.type === 'video' ? clips.idle?.length ? { type: 'video' as const, videos, clips } : { type: 'portrait' as const, assetId: current.companion.appearance.portraitAssetId } : visual } }
      commit({ ...current, assets: current.assets.filter((item) => item.id !== id), chapters: Object.fromEntries(Object.entries(current.chapters).map(([chapterId, chapter]) => [chapterId, chapter.impressionAssetId === id ? { ...chapter, impressionAssetId: undefined } : chapter])), companion }, set)
    },
    linkAssetToChapter: (assetId, chapterId) => { const current = get().data; commit({ ...current, assets: current.assets.map((asset) => asset.id === assetId ? { ...asset, chapterIds: [...new Set([...asset.chapterIds, chapterId])] } : asset) }, set) },
    setChapterImpression: (chapterId, assetId) => { const current = get().data; commit({ ...current, chapters: { ...current.chapters, [chapterId]: { ...current.chapters[chapterId], impressionAssetId: assetId } }, assets: current.assets.map((asset) => asset.id === assetId ? { ...asset, chapterIds: [...new Set([...asset.chapterIds, chapterId])] } : asset) }, set) },
    recordAiGeneration: (generation: AiGeneration) => { const current = get().data; commit({ ...current, aiGenerations: [...current.aiGenerations, generation] }, set) },
  }
}

export function assetIdsInContent(content: JSONContent): string[] {
  const found = new Set<string>()
  const visit = (node: JSONContent) => { const id = node.attrs?.assetId; if (typeof id === 'string') found.add(id); node.content?.forEach(visit) }
  visit(content)
  return [...found]
}

export function referencedAssetIds(data: LibraryData) {
  const ids = new Set<string>()
  Object.values(data.chapters).forEach((chapter) => { assetIdsInContent(chapter.content).forEach((id) => ids.add(id)); if (chapter.impressionAssetId) ids.add(chapter.impressionAssetId) })
  if (data.settings.backgroundImage?.startsWith('asset:')) ids.add(data.settings.backgroundImage.slice(6))
  Object.values(data.settings.backgrounds?.images ?? {}).forEach((source) => {
    if (source?.startsWith('asset:')) ids.add(source.slice(6))
  })
  const visual = data.companion.desktop.visual
  if (visual.type === 'portrait' && visual.assetId) ids.add(visual.assetId)
  if (visual.type === 'video') {
    Object.values(visual.videos).forEach((id) => id && ids.add(id))
    Object.values(visual.clips ?? {}).forEach((clips) => clips.forEach((id) => ids.add(id)))
  }
  Object.values(data.companion.desktop.videoAssets ?? {}).forEach((id) => id && ids.add(id))
  Object.values(data.companion.desktop.videoClips ?? {}).forEach((clips) => clips.forEach((id) => ids.add(id)))
  if (data.companion.appearance.portraitAssetId) ids.add(data.companion.appearance.portraitAssetId)
  const character = data.companion.desktop.characterPackage
  if (character) {
    ids.add(character.baseAssetId)
    if (character.baseSprite) ids.add(character.baseSprite.assetId)
    Object.values(character.eyes).forEach((states) => Object.values(states).forEach((sprite) => sprite && ids.add(characterSpriteAssetId(sprite))))
    Object.values(character.brows).forEach((sprite) => ids.add(characterSpriteAssetId(sprite)))
    Object.values(character.mouth).forEach((sprite) => ids.add(characterSpriteAssetId(sprite)))
    Object.values(character.overlays).forEach((sprite) => ids.add(characterSpriteAssetId(sprite)))
    Object.values(character.motions).forEach((motion) => motion.frameAssetIds.forEach((id) => ids.add(id)))
  }
  return ids
}

export function orphanAssets(data: LibraryData) { const referenced = referencedAssetIds(data); return data.assets.filter((asset) => !asset.deletedAt && !referenced.has(asset.id)) }
