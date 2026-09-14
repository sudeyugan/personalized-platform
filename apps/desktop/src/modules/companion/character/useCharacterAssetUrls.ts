import { useEffect, useState } from 'react'
import type { Asset } from '../../../domain/models'
import { assetRepository } from '../../../infrastructure/assetRepository'
import { characterAssetIds, type CharacterPackage } from './CharacterConfig'

export function useCharacterAssetUrls(character: CharacterPackage | undefined, assets: Asset[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let disposed = false
    const created: string[] = []
    if (!character) { setUrls({}); return }
    void Promise.all(characterAssetIds(character).map(async (id) => {
      const asset = assets.find((item) => item.id === id && !item.deletedAt)
      if (!asset) return
      const url = await assetRepository.readUrl(asset, false)
      created.push(url)
      return [id, url] as const
    })).then((entries) => { if (!disposed) setUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)))) }).catch(() => { if (!disposed) setUrls({}) })
    return () => { disposed = true; created.forEach((url) => URL.revokeObjectURL(url)) }
  }, [character, assets])
  return urls
}
