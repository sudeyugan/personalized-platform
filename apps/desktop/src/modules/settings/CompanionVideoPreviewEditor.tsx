import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Asset, CompanionVideoPlacement } from '../../domain/models'
import { assetRepository } from '../../infrastructure/assetRepository'
import { companionVideoPlacementStyle, defaultCompanionVideoPlacement, normalizeCompanionVideoPlacement } from '../companion/companionVideoPlacement'

interface CompanionVideoPreviewEditorProps {
  asset: Asset
  placement?: CompanionVideoPlacement
  onCommit: (placement: CompanionVideoPlacement) => void
}

export function CompanionVideoPreviewEditor({ asset, placement, onCommit }: CompanionVideoPreviewEditorProps) {
  const [url, setUrl] = useState('')
  const [draft, setDraft] = useState(() => normalizeCompanionVideoPlacement(placement))
  const [playing, setPlaying] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const draftRef = useRef(draft)

  useEffect(() => {
    const next = normalizeCompanionVideoPlacement(placement)
    draftRef.current = next
    setDraft(next)
  }, [asset.id, placement])

  useEffect(() => {
    let current = ''
    void assetRepository.readUrl(asset).then((value) => {
      current = value
      setUrl(value)
    }).catch(() => setUrl(''))
    return () => {
      if (current) URL.revokeObjectURL(current)
    }
  }, [asset])

  const update = (changes: Partial<CompanionVideoPlacement>) => {
    setDraft((current) => {
      const next = normalizeCompanionVideoPlacement({ ...current, ...changes })
      draftRef.current = next
      return next
    })
  }
  const commit = () => onCommit(draftRef.current)
  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }
  const reset = () => {
    setDraft(defaultCompanionVideoPlacement)
    draftRef.current = defaultCompanionVideoPlacement
    onCommit(defaultCompanionVideoPlacement)
  }

  return <section className="companion-video-preview-editor" aria-label={`调整 ${asset.fileName}`}>
    <div className="companion-video-preview-stage">
      {url ? <video ref={videoRef} src={url} style={companionVideoPlacementStyle(draft)} autoPlay loop muted playsInline onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} /> : <span>正在载入预览…</span>}
    </div>
    <div className="companion-video-adjustments">
      <label><span>大小 <b>{Math.round(draft.scale * 100)}%</b></span><input aria-label="视频大小" type="range" min="60" max="180" step="1" value={Math.round(draft.scale * 100)} onChange={(event) => update({ scale: Number(event.target.value) / 100 })} onPointerUp={commit} onKeyUp={commit} onBlur={commit} /></label>
      <label><span>水平位置 <b>{draft.x > 0 ? '+' : ''}{draft.x}%</b></span><input aria-label="视频水平位置" type="range" min="-40" max="40" step="1" value={draft.x} onChange={(event) => update({ x: Number(event.target.value) })} onPointerUp={commit} onKeyUp={commit} onBlur={commit} /></label>
      <label><span>垂直位置 <b>{draft.y > 0 ? '+' : ''}{draft.y}%</b></span><input aria-label="视频垂直位置" type="range" min="-40" max="40" step="1" value={draft.y} onChange={(event) => update({ y: Number(event.target.value) })} onPointerUp={commit} onKeyUp={commit} onBlur={commit} /></label>
    </div>
    <footer>
      <button type="button" className="ghost-button quiet" onClick={togglePlayback}>{playing ? <Pause size={12} /> : <Play size={12} />}{playing ? '暂停预览' : '继续播放'}</button>
      <button type="button" className="ghost-button quiet" onClick={reset}><RotateCcw size={12} />恢复默认</button>
    </footer>
  </section>
}
