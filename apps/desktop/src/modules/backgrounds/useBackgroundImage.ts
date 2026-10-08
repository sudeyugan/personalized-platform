import { useEffect, useState } from 'react'
import { assetRepository } from '../../infrastructure/assetRepository'
import { useLibraryStore } from '../../state/useLibraryStore'

export function useBackgroundImage(source?: string) {
  const assetId = source?.startsWith('asset:') ? source.slice(6) : undefined
  const mimeType = useLibraryStore(store => assetId ? store.data.assets.find(item => item.id === assetId)?.mimeType : undefined)
  const [loaded, setLoaded] = useState<{ source: string; url: string }>()
  useEffect(() => {
    if (!assetId || !mimeType || !source) return
    let disposed = false
    let url: string | undefined
    void assetRepository.readUrl({ id: assetId, mimeType }).then(value => {
      url = value
      if (disposed) URL.revokeObjectURL(value)
      else setLoaded({ source, url: value })
    }).catch(() => { if (!disposed) setLoaded(undefined) })
    return () => { disposed = true; if (url) URL.revokeObjectURL(url) }
  }, [assetId, mimeType, source])
  return assetId ? loaded && loaded.source === source ? loaded.url : undefined : source
}
