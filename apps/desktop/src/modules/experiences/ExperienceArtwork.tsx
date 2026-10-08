import { useEffect, useState, type CSSProperties } from 'react'
import type { Asset } from '../../domain/models'
import { categoryLabels, type ExperienceDraft } from '../../domain/experiences'
import { assetRepository } from '../../infrastructure/assetRepository'
import { useObjectUrl } from './useObjectUrl'

export function ExperienceArtwork({ entry, asset, file }: { entry: ExperienceDraft; asset?: Asset; file?: File }) {
  const fileUrl = useObjectUrl(file)
  const [savedUrl, setSavedUrl] = useState('')
  useEffect(() => {
    let cancelled = false, owned = ''
    setSavedUrl('')
    if (asset && !asset.deletedAt) void assetRepository.readUrl(asset).then(url => {
      owned = url
      if (cancelled) URL.revokeObjectURL(url)
      else setSavedUrl(url)
    }).catch(() => { if (!cancelled) setSavedUrl('') })
    return () => { cancelled = true; if (owned) URL.revokeObjectURL(owned) }
  }, [asset])
  const imageUrl = fileUrl || savedUrl
  const hash = [...entry.title].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0)
  return <div className={'experience-art art-' + entry.paperStyle + (entry.category === 'place' ? ' art-place' : '')} style={{ '--art-hue': hash % 360 } as CSSProperties}>
    <div className="paper-cover-fallback">
      <span className="paper-cover-kicker">{entry.category === 'place' ? '途 经 · 此 处' : categoryLabels[entry.category]}</span>
      {entry.category === 'place' ? <svg viewBox="0 0 120 65" fill="none" aria-hidden="true"><path d="M3 56 37 17l24 27 21-33 35 45M9 56h104M45 37l9-10M83 30l8 10" stroke="currentColor" strokeWidth="1.2"/><circle cx="104" cy="13" r="7"/><path d="M60 56v-8m4 8v-5" stroke="currentColor"/></svg> : <span className="paper-cover-ornament" aria-hidden="true">✦</span>}
      <strong>{entry.title || '给回忆，留一页'}</strong><small>{entry.creator || (entry.category === 'place' ? '走过的路，也算读过的书' : '一隅 · 私人藏书票')}</small>
    </div>
    {imageUrl && <img key={imageUrl} src={imageUrl} alt={entry.title + '封面'} onError={event => { event.currentTarget.style.visibility = 'hidden' }} />}
  </div>
}
