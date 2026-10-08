import type { BackgroundSlot } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'

let migration: Promise<void> | undefined
export function migrateBackgrounds() {
  if (migration) return migration
  migration = (async () => {
    const images = { ...useLibraryStore.getState().data.settings.backgrounds.images }
    const sources = [...new Set(Object.values(images).filter((source): source is string => !!source?.startsWith('data:image/')))]
    for (const source of sources) {
      // Never load a URL or remove the original until the new asset is successfully stored.
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(source)
      if (!match || source.length > 35 * 1024 * 1024) continue
      const binary = atob(match[2])
      const file = new File([Uint8Array.from(binary, character => character.charCodeAt(0))], '原背景.' + match[1].split('/')[1], { type: match[1] })
      const asset = await useLibraryStore.getState().importAsset(file, { purpose: 'background' })
      const current = useLibraryStore.getState().data.settings.backgrounds.images
      const replacements = Object.fromEntries(Object.entries(images).filter(([slot, value]) => value === source && current[slot as BackgroundSlot] === source).map(([slot]) => [slot, 'asset:' + asset.id]))
      if (Object.keys(replacements).length) useLibraryStore.getState().setBackgroundSettings({ images: replacements })
    }
  })().finally(() => { migration = undefined })
  return migration
}
