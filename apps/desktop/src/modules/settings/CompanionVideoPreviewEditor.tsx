import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Asset, CompanionVideoPlacement } from '../../domain/models'
import { assetRepository } from '../../infrastructure/assetRepository'
import { companionVideoPlacementStyle, defaultCompanionVideoPlacement, moveCompanionVideoPlacement, normalizeCompanionVideoPlacement, scaleCompanionVideoPlacement } from '../companion/companionVideoPlacement'

export interface CompanionVideoCalibrationAsset {
  asset: Asset
  placement?: CompanionVideoPlacement
}

interface CompanionVideoPreviewEditorProps {
  asset: Asset
  placement?: CompanionVideoPlacement
  referenceAssets: CompanionVideoCalibrationAsset[]
  onCommit: (placement: CompanionVideoPlacement) => void
}

function useAssetUrl(asset?: Asset) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let current = ''
    let cancelled = false
    setUrl('')
    if (!asset) return
    void assetRepository.readUrl(asset).then((value) => {
      if (cancelled) {
        URL.revokeObjectURL(value)
        return
      }
      current = value
      setUrl(value)
    }).catch(() => setUrl(''))
    return () => {
      cancelled = true
      if (current) URL.revokeObjectURL(current)
    }
  }, [asset])

  return url
}

const displayOffset = (value: number) => {
  const rounded = Math.round(value * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

export function CompanionVideoPreviewEditor({ asset, placement, referenceAssets, onCommit }: CompanionVideoPreviewEditorProps) {
  const availableReferences = referenceAssets.filter((entry) => entry.asset.id !== asset.id)
  const referenceKey = availableReferences.map((entry) => entry.asset.id).join('|')
  const [referenceAssetId, setReferenceAssetId] = useState('')
  const [referenceOpacity, setReferenceOpacity] = useState(45)
  const [draft, setDraft] = useState(() => normalizeCompanionVideoPlacement(placement))
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const draftRef = useRef(draft)
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; placement: CompanionVideoPlacement } | undefined>(undefined)
  const resizeRef = useRef<{ pointerId: number; clientX: number; clientY: number; width: number; height: number; placement: CompanionVideoPlacement } | undefined>(undefined)

  const url = useAssetUrl(asset)
  const reference = availableReferences.find((entry) => entry.asset.id === referenceAssetId)
  const referenceUrl = useAssetUrl(reference?.asset)

  useEffect(() => {
    const next = normalizeCompanionVideoPlacement(placement)
    draftRef.current = next
    setDraft(next)
  }, [asset.id, placement])

  useEffect(() => {
    const referenceIds = referenceKey ? referenceKey.split('|') : []
    setReferenceAssetId((current) => referenceIds.includes(current)
      ? current
      : referenceIds[0] ?? '')
  }, [asset.id, referenceKey])

  const update = (changes: Partial<CompanionVideoPlacement>) => {
    setDraft((current) => {
      const next = normalizeCompanionVideoPlacement({ ...current, ...changes })
      draftRef.current = next
      return next
    })
  }
  const applyPlacement = (next: CompanionVideoPlacement, commit = false) => {
    draftRef.current = next
    setDraft(next)
    if (commit) onCommit(next)
  }
  const commit = () => onCommit(draftRef.current)
  const showFirstFrame = () => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    video.currentTime = 0
    setPlaying(false)
  }
  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }
  const reset = () => {
    applyPlacement(defaultCompanionVideoPlacement, true)
  }
  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!url || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      placement: draftRef.current,
    }
  }
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const origin = dragRef.current
    if (!origin || origin.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    applyPlacement(moveCompanionVideoPlacement(
      origin.placement,
      event.clientX - origin.clientX,
      event.clientY - origin.clientY,
      bounds.width,
      bounds.height,
    ))
  }
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = undefined
    event.currentTarget.releasePointerCapture(event.pointerId)
    commit()
  }
  const beginResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!url || event.button !== 0) return
    event.stopPropagation()
    const stage = event.currentTarget.parentElement
    if (!stage) return
    const bounds = stage.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      width: bounds.width,
      height: bounds.height,
      placement: draftRef.current,
    }
  }
  const resize = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const origin = resizeRef.current
    if (!origin || origin.pointerId !== event.pointerId) return
    applyPlacement(scaleCompanionVideoPlacement(
      origin.placement,
      event.clientX - origin.clientX,
      event.clientY - origin.clientY,
      origin.width,
      origin.height,
    ))
  }
  const endResize = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (resizeRef.current?.pointerId !== event.pointerId) return
    resizeRef.current = undefined
    event.currentTarget.releasePointerCapture(event.pointerId)
    commit()
  }
  const moveWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const distance = event.shiftKey ? 5 : 1
    const change = event.key === 'ArrowLeft' ? { x: draft.x - distance }
      : event.key === 'ArrowRight' ? { x: draft.x + distance }
        : event.key === 'ArrowUp' ? { y: draft.y - distance }
          : event.key === 'ArrowDown' ? { y: draft.y + distance }
            : undefined
    if (!change) return
    event.preventDefault()
    applyPlacement(normalizeCompanionVideoPlacement({ ...draft, ...change }), true)
  }

  return <section className="companion-video-preview-editor" aria-label={`调整 ${asset.fileName}`}>
    <div className="companion-video-calibration-toolbar">
      <label>
        <span>首帧基底</span>
        <select aria-label="选择首帧基底" value={referenceAssetId} onChange={(event) => setReferenceAssetId(event.target.value)}>
          <option value="">不使用基底</option>
          {availableReferences.map((entry) => <option key={entry.asset.id} value={entry.asset.id}>{entry.asset.fileName}</option>)}
        </select>
      </label>
      <small>{availableReferences.length ? '拖动画面定位，拖右下角保持原比例缩放。' : '再添加一段 WebM 后即可选择首帧基底。'}</small>
    </div>
    <div
      className="companion-video-preview-stage calibration-stage"
      role="application"
      tabIndex={0}
      aria-label="拖动画面调整位置，拖动右下角控制点保持原比例缩放；方向键微调位置"
      onPointerDown={beginDrag}
      onPointerMove={drag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={moveWithKeyboard}
    >
      {referenceUrl && reference && <video
        className="calibration-reference"
        src={referenceUrl}
        style={{ ...companionVideoPlacementStyle(reference.placement), opacity: referenceOpacity / 100 }}
        muted
        playsInline
        preload="auto"
        onLoadedData={(event) => { event.currentTarget.pause(); event.currentTarget.currentTime = 0 }}
      />}
      {url ? <video
        className="calibration-current"
        ref={videoRef}
        src={url}
        style={companionVideoPlacementStyle(draft)}
        loop
        muted
        playsInline
        preload="auto"
        onLoadedData={showFirstFrame}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      /> : <span>正在载入预览…</span>}
      <i className="calibration-guide horizontal" aria-hidden="true" />
      <i className="calibration-guide vertical" aria-hidden="true" />
      <b className="calibration-drag-hint">拖动画面定位 · 右下角缩放</b>
      <button
        type="button"
        className="calibration-resize-handle"
        aria-label="保持原比例调整视频大小"
        onPointerDown={beginResize}
        onPointerMove={resize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      >↘</button>
    </div>
    <div className="companion-video-adjustments">
      <label><span>大小 <b>{Math.round(draft.scale * 100)}%</b></span><input aria-label="视频大小" type="range" min="60" max="180" step="1" value={Math.round(draft.scale * 100)} onChange={(event) => update({ scale: Number(event.target.value) / 100 })} onPointerUp={commit} onKeyUp={commit} onBlur={commit} /></label>
      <label><span>水平位置 <b>{displayOffset(draft.x)}</b></span><input aria-label="视频水平位置" type="range" min="-40" max="40" step=".5" value={draft.x} onChange={(event) => update({ x: Number(event.target.value) })} onPointerUp={commit} onKeyUp={commit} onBlur={commit} /></label>
      <label><span>垂直位置 <b>{displayOffset(draft.y)}</b></span><input aria-label="视频垂直位置" type="range" min="-40" max="40" step=".5" value={draft.y} onChange={(event) => update({ y: Number(event.target.value) })} onPointerUp={commit} onKeyUp={commit} onBlur={commit} /></label>
      {reference && <label><span>基底透明度 <b>{referenceOpacity}%</b></span><input aria-label="首帧基底透明度" type="range" min="10" max="80" step="5" value={referenceOpacity} onChange={(event) => setReferenceOpacity(Number(event.target.value))} /></label>}
    </div>
    <footer>
      <button type="button" className="ghost-button quiet" onClick={showFirstFrame}>回到首帧</button>
      <button type="button" className="ghost-button quiet" onClick={togglePlayback}>{playing ? <Pause size={12} /> : <Play size={12} />}{playing ? '暂停动作' : '播放动作'}</button>
      <button type="button" className="ghost-button quiet" onClick={reset}><RotateCcw size={12} />恢复默认</button>
    </footer>
  </section>
}
