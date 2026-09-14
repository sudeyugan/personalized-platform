import { useEffect, useState } from 'react'
import type { Asset } from '../../domain/models'
import { assetRepository } from '../../infrastructure/assetRepository'

export function AssetImage({ asset, thumbnail = true, alt = '' }: { asset: Asset; thumbnail?: boolean; alt?: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let current = ''
    void assetRepository.readUrl(asset, thumbnail).then((value) => { current = value; setUrl(value) }).catch(() => setUrl(''))
    return () => { if (current) URL.revokeObjectURL(current) }
  }, [asset, thumbnail])
  return url ? <img src={url} alt={alt || asset.alt || asset.fileName} /> : <span className="asset-loading">图片暂不可用</span>
}
