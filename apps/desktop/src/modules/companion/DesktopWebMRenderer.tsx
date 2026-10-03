import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { emitTo } from '@tauri-apps/api/event'
import { availableMonitors, getCurrentWindow, type Monitor } from '@tauri-apps/api/window'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CompanionVideoState } from '../../domain/models'
import { companionBlobAssetIds, type CompanionDesktopSnapshot } from './companionDesktop'
import { availableIdleInterludes, chooseNextIdleClip, configuredClipsForState, configuredIdleInterludes, createVideoPlaybackRotation, isSustainedVideoState, isTransientVideoState, nextIdleInterludeDelay } from './companionVideoPlayback'
import { companionVideoPlacementStyle } from './companionVideoPlacement'

type ReadyVisual = { id: string; instanceKey: string; kind: 'image' | 'video'; preview?: boolean; url: string }

function clipsForState(snapshot: CompanionDesktopSnapshot, state: CompanionVideoState) {
  const clips = configuredClipsForState(snapshot.visual, state)
  if (clips.length) return clips
  if (state === 'idle') return []
  return clipsForState(snapshot, 'idle')
}

function nearestMonitor(monitors: Monitor[], x: number, y: number) {
  return monitors.reduce<Monitor | undefined>((nearest, monitor) => {
    if (!nearest) return monitor
    const distance = (candidate: Monitor) => {
      const area = candidate.workArea
      const centerX = area.position.x + area.size.width / 2
      const centerY = area.position.y + area.size.height / 2
      return Math.hypot(x - centerX, y - centerY)
    }
    return distance(monitor) < distance(nearest) ? monitor : nearest
  }, undefined)
}

async function keepCompanionVisible() {
  const window = getCurrentWindow()
  const [position, size, monitors] = await Promise.all([window.outerPosition(), window.outerSize(), availableMonitors()])
  const monitor = nearestMonitor(monitors, position.x + size.width / 2, position.y + size.height / 2)
  if (!monitor) return
  const area = monitor.workArea
  const maxX = Math.max(area.position.x, area.position.x + area.size.width - size.width)
  const maxY = Math.max(area.position.y, area.position.y + area.size.height - size.height)
  const x = Math.min(maxX, Math.max(area.position.x, position.x))
  const y = Math.min(maxY, Math.max(area.position.y, position.y))
  if (x !== position.x || y !== position.y) await window.setPosition(new PhysicalPosition(x, y))
}

function useDesktopVisualUrls(snapshot: CompanionDesktopSnapshot) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const urlsRef = useRef<Record<string, string>>({})
  const assetIds = useMemo(() => companionBlobAssetIds(snapshot), [snapshot])
  useEffect(() => {
    let disposed = false
    const missingIds = assetIds.filter((id) => !urlsRef.current[id])
    if (!missingIds.length) return
    void Promise.all(missingIds.map(async (id) => {
      const mimeType = snapshot.assetMimeTypes[id]
      if (!mimeType) return
      const bytes = await invoke<ArrayBuffer>('read_companion_image_asset', { id, mimeType })
      const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
      return [id, url] as const
    })).then((entries) => {
      if (disposed) {
        entries.forEach((entry) => entry && URL.revokeObjectURL(entry[1]))
        return
      }
      const loaded = Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)))
      urlsRef.current = { ...urlsRef.current, ...loaded }
      setUrls(urlsRef.current)
    }).catch(() => undefined)
    return () => { disposed = true }
  }, [assetIds, snapshot.assetMimeTypes])
  useEffect(() => () => {
    Object.values(urlsRef.current).forEach((url) => URL.revokeObjectURL(url))
    urlsRef.current = {}
  }, [])
  return urls
}

export interface PreviewVideoRequest { assetId: string; instanceKey: string }
interface Props { snapshot: CompanionDesktopSnapshot; receivedSnapshot: boolean; previewRequest?: PreviewVideoRequest; onPreviewEnd: (instanceKey: string) => void }
export function DesktopWebMRenderer({ snapshot, receivedSnapshot, previewRequest, onPreviewEnd }: Props) {
  const [readyVisual, setReadyVisual] = useState<ReadyVisual>()
  const [selectedVideoId, setSelectedVideoId] = useState<string>()
  const [idleInterlude, setIdleInterlude] = useState<CompanionVideoState>()
  const [idleInterludeReady, setIdleInterludeReady] = useState(false)
  const [playbackRevision, setPlaybackRevision] = useState(0)
  const [heldFrameAssetId, setHeldFrameAssetId] = useState<string>()
  const rotation = useRef(createVideoPlaybackRotation())
  const selectedAction = useRef<CompanionVideoState | undefined>(undefined)
  const pendingReadyId = useRef<string | undefined>(undefined)
  const heldFrameAssetIdRef = useRef<string | undefined>(undefined)
  const holdRevision = useRef(0)
  const holdCanvasRef = useRef<HTMLCanvasElement>(null)
  const pointerStart = useRef<{ x: number; y: number } | undefined>(undefined)
  const pointerId = useRef<number | undefined>(undefined)
  const dragged = useRef(false)
  const urls = useDesktopVisualUrls(snapshot)
  useEffect(() => {
    const appWindow = getCurrentWindow()
    void Promise.all([
      appWindow.setIgnoreCursorEvents(snapshot.desktopMode === 'quiet'),
      appWindow.setAlwaysOnTop(snapshot.desktopMode !== 'normal'),
    ]).catch(() => undefined)
  }, [snapshot.desktopMode])
  useEffect(() => {
    const appWindow = getCurrentWindow()
    let correctionTimer: ReturnType<typeof setTimeout> | undefined
    void keepCompanionVisible()
    let stopMoved: (() => void) | undefined
    void appWindow.onMoved(() => {
      globalThis.clearTimeout(correctionTimer)
      correctionTimer = globalThis.setTimeout(() => { void keepCompanionVisible().then(() => emitTo('main', 'companion:moved')) }, 180)
    }).then((stop) => { stopMoved = stop })
    return () => { stopMoved?.(); globalThis.clearTimeout(correctionTimer) }
  }, [])
  const portraitUrl = snapshot.visual.type === 'portrait' && snapshot.visual.assetId ? urls[snapshot.visual.assetId] : undefined
  const displayedAction = snapshot.action === 'idle' ? idleInterlude ?? 'idle' : snapshot.action
  const interludeConfigKey = configuredIdleInterludes(snapshot.visual).join(',')
  const videoCandidates = useMemo(() => clipsForState(snapshot, displayedAction), [displayedAction, snapshot])
  useEffect(() => {
    if (snapshot.visual.type !== 'video') { setSelectedVideoId(undefined); return }
    if (selectedAction.current === displayedAction && videoCandidates.includes(selectedVideoId ?? '')) return
    selectedAction.current = displayedAction
    setSelectedVideoId(displayedAction === 'idle' ? videoCandidates[0] : rotation.current.choose(`clips:${displayedAction}`, videoCandidates))
  }, [displayedAction, selectedVideoId, snapshot.visual, videoCandidates])
  useEffect(() => {
    if (snapshot.action !== 'idle') { setIdleInterlude(undefined); setIdleInterludeReady(false) }
  }, [snapshot.action])
  useEffect(() => {
    if (!interludeConfigKey || snapshot.visual.type !== 'video' || snapshot.action !== 'idle' || idleInterlude || idleInterludeReady || previewRequest) return
    const timer = window.setTimeout(() => setIdleInterludeReady(true), nextIdleInterludeDelay())
    return () => window.clearTimeout(timer)
  }, [idleInterlude, idleInterludeReady, interludeConfigKey, previewRequest, snapshot.action, snapshot.visual.type])
  const videoId = snapshot.visual.type === 'video' ? selectedVideoId : undefined
  const videoUrl = videoId ? convertFileSrc(videoId, 'yiyu-companion') : undefined
  const normalVisual: ReadyVisual | undefined = videoId && videoUrl
    ? { id: videoId, instanceKey: `${displayedAction}:${videoId}:${playbackRevision}`, kind: 'video', url: videoUrl }
    : snapshot.visual.type === 'portrait' && snapshot.visual.assetId && portraitUrl
      ? { id: snapshot.visual.assetId, instanceKey: snapshot.visual.assetId, kind: 'image', url: portraitUrl }
      : undefined
  const previewUrl = previewRequest ? convertFileSrc(previewRequest.assetId, 'yiyu-companion') : undefined
  const desiredVisual: ReadyVisual | undefined = previewRequest && previewUrl
    ? { id: previewRequest.assetId, instanceKey: previewRequest.instanceKey, kind: 'video', preview: true, url: previewUrl }
    : normalVisual
  const isChangingVisual = Boolean(desiredVisual && desiredVisual.instanceKey !== readyVisual?.instanceKey)
  const hasConfiguredVisual = snapshot.visual.type === 'video'
    ? clipsForState(snapshot, 'idle').length > 0
    : snapshot.visual.type === 'portrait'
      ? Boolean(snapshot.visual.assetId)
      : true
  useEffect(() => {
    if (!receivedSnapshot || hasConfiguredVisual) return
    setReadyVisual(undefined)
    heldFrameAssetIdRef.current = undefined
    setHeldFrameAssetId(undefined)
  }, [hasConfiguredVisual, receivedSnapshot])
  const releaseHeldFrameAfterPaint = () => {
    if (!heldFrameAssetIdRef.current) return
    const revision = ++holdRevision.current
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (holdRevision.current !== revision) return
      heldFrameAssetIdRef.current = undefined
      setHeldFrameAssetId(undefined)
    }))
  }
  const holdLastVideoFrame = (video: HTMLVideoElement, assetId: string) => {
    const canvas = holdCanvasRef.current
    if (!canvas || !video.videoWidth || !video.videoHeight) return
    const context = canvas.getContext('2d')
    if (!context) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    context.clearRect(0, 0, canvas.width, canvas.height)
    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
    } catch {
      return
    }
    holdRevision.current += 1
    heldFrameAssetIdRef.current = assetId
    setHeldFrameAssetId(assetId)
  }
  const markReady = (next: ReadyVisual) => {
    if (next.instanceKey !== desiredVisual?.instanceKey || next.instanceKey === readyVisual?.instanceKey) return
    setReadyVisual(next)
    pendingReadyId.current = undefined
    void emitTo('main', 'companion:visual-ready', { assetId: next.id })
    releaseHeldFrameAfterPaint()
  }
  const presentVideo = (video: HTMLVideoElement, next: ReadyVisual) => {
    if (pendingReadyId.current === next.instanceKey) return
    pendingReadyId.current = next.instanceKey
    const commitPresentedFrame = () => window.requestAnimationFrame(() => {
      if (pendingReadyId.current === next.instanceKey) markReady(next)
    })
    if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(() => commitPresentedFrame())
    else window.requestAnimationFrame(() => window.requestAnimationFrame(commitPresentedFrame))
  }
  const videoStyle = (assetId: string) => companionVideoPlacementStyle(snapshot.videoPlacements[assetId])
  const reportLoadError = (assetId: string) => {
    void emitTo('main', 'companion:visual-error', { assetId })
    if (previewRequest?.assetId === assetId) onPreviewEnd(previewRequest.instanceKey)
  }
  const advanceVideo = (video: HTMLVideoElement) => {
    if (!readyVisual) return
    if (readyVisual.preview) {
      holdLastVideoFrame(video, readyVisual.id)
      onPreviewEnd(readyVisual.instanceKey)
      return
    }
    if (readyVisual.instanceKey !== normalVisual?.instanceKey) return
    holdLastVideoFrame(video, readyVisual.id)
    if (idleInterlude === displayedAction) {
      setIdleInterlude(undefined)
      return
    }
    if (isTransientVideoState(displayedAction)) {
      void emitTo('main', 'companion:transient-ended', { state: displayedAction })
      return
    }
    if (snapshot.visual.type !== 'video') return
    if (displayedAction !== 'idle') {
      const next = rotation.current.choose(`clips:${displayedAction}`, videoCandidates)
      if (next === readyVisual.id) setPlaybackRevision((current) => current + 1)
      else setSelectedVideoId(next)
      return
    }
    if (idleInterludeReady) {
      const nextInterlude = rotation.current.choose('interludes', availableIdleInterludes(snapshot.visual))
      setIdleInterludeReady(false)
      if (nextInterlude) {
        setIdleInterlude(nextInterlude)
        return
      }
    }
    const nextIdle = chooseNextIdleClip(snapshot.visual, readyVisual.id, Math.random, rotation.current)
    if (!nextIdle) return
    if (nextIdle === readyVisual.id) setPlaybackRevision((current) => current + 1)
    else setSelectedVideoId(nextIdle)
  }
  const hasIdleInterludes = snapshot.visual.type === 'video' && configuredIdleInterludes(snapshot.visual).length > 0
  const loopVideo = !idleInterlude && isSustainedVideoState(displayedAction) && videoCandidates.length < 2 && (displayedAction !== 'idle' || !hasIdleInterludes)
  const visual = <>
    {readyVisual && (readyVisual.kind === 'video'
      ? <video className="desktop-media ready" key={readyVisual.instanceKey} style={videoStyle(readyVisual.id)} src={readyVisual.url} crossOrigin="anonymous" autoPlay loop={readyVisual.preview ? false : loopVideo} muted playsInline draggable={false} onEnded={(event) => advanceVideo(event.currentTarget)} />
      : <img className="desktop-media ready" key={readyVisual.instanceKey} style={videoStyle(readyVisual.id)} src={readyVisual.url} alt="" draggable={false} />)}
    <canvas ref={holdCanvasRef} className={`desktop-media held-frame${heldFrameAssetId ? ' active' : ''}`} style={heldFrameAssetId ? videoStyle(heldFrameAssetId) : undefined} aria-hidden="true" />
    {isChangingVisual && desiredVisual && (desiredVisual.kind === 'video'
      ? <video className="desktop-media pending" key={desiredVisual.instanceKey} style={videoStyle(desiredVisual.id)} src={desiredVisual.url} crossOrigin="anonymous" autoPlay loop={desiredVisual.preview ? false : loopVideo} muted playsInline preload="auto" draggable={false} onPlaying={(event) => presentVideo(event.currentTarget, desiredVisual)} onError={() => reportLoadError(desiredVisual.id)} />
      : <img className="desktop-media pending" key={desiredVisual.instanceKey} style={videoStyle(desiredVisual.id)} src={desiredVisual.url} alt="" draggable={false} onLoad={() => markReady(desiredVisual)} onError={() => reportLoadError(desiredVisual.id)} />)}
    {!readyVisual && receivedSnapshot && !hasConfiguredVisual && <div className={`desktop-character hair-${snapshot.appearance.hair} outfit-${snapshot.appearance.outfit} expression-${snapshot.expression}`}><span className="character-hair" /><span className="character-face">隅</span><span className="character-outfit" /></div>}
  </>
  const beginPointer = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointerId.current = event.pointerId
    pointerStart.current = { x: event.clientX, y: event.clientY }
    dragged.current = false
  }
  const movePointer = (event: React.PointerEvent) => {
    const start = pointerStart.current
    if (!start || dragged.current || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return
    dragged.current = true
    void getCurrentWindow().startDragging()
  }
  const endPointer = (event: React.PointerEvent) => {
    if (pointerId.current !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (pointerStart.current && !dragged.current) void emitTo('main', 'companion:chat-toggle')
    pointerStart.current = undefined
    pointerId.current = undefined
    dragged.current = false
  }
  const cancelPointer = (event: React.PointerEvent) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    pointerStart.current = undefined
    pointerId.current = undefined
    dragged.current = false
  }
  return <main className={`desktop-companion mode-${snapshot.desktopMode} action-${snapshot.action} visual-${snapshot.visual.type}`}>
    <div className="desktop-visual">{visual}<div className="desktop-interaction-layer" role="button" tabIndex={0} onPointerDown={beginPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={cancelPointer} onDoubleClick={() => void emitTo('main', 'companion:open-main')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') void emitTo('main', 'companion:chat-toggle') }} aria-label={`${snapshot.name}，${snapshot.actionLabel}`} /></div>
  </main>
}
