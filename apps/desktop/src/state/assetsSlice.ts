import type { JSONContent } from '@tiptap/react'
import type { AiGeneration, CharacterSpriteReference, LibraryData } from '../domain/models'
import { assetRepository } from '../infrastructure/assetRepository'
import { libraryRepository } from '../infrastructure/libraryRepository'
import type { LibraryStore } from './libraryStoreTypes'

type SetStore = (partial: Partial<LibraryStore>) => void
const commit = (data: LibraryData, set: SetStore) => { set({ data }); void libraryRepository.save(data) }
const characterSpriteAssetId = (sprite: CharacterSpriteReference) => typeof sprite === 'string' ? sprite : sprite.assetId

export function createAssetsSlice(get: () => LibraryStore, set: SetStore): Pick<LibraryStore, 'importAsset' | 'updateAsset' | 'trashAsset' | 'restoreAsset' | 'permanentlyDeleteAsset' | 'linkAssetToChapter' | 'setChapterImpression' | 'recordAiGeneration'> {
  return {
    importAsset: async (file, context) => {
      const asset = await assetRepository.importImage(file, context)
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
      commit({ ...current, assets: current.assets.filter((item) => item.id !== id), chapters: Object.fromEntries(Object.entries(current.chapters).map(([chapterId, chapter]) => [chapterId, chapter.impressionAssetId === id ? { ...chapter, impressionAssetId: undefined } : chapter])) }, set)
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
