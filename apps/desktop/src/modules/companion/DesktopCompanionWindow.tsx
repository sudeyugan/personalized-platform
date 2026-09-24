import { invoke } from '@tauri-apps/api/core'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { emitTo, listen } from '@tauri-apps/api/event'
import { availableMonitors, getCurrentWindow, type Monitor } from '@tauri-apps/api/window'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CompanionVideoState } from '../../domain/models'
import { companionVisualAssetIds, emptyCompanionDesktopSnapshot, type CompanionDesktopSnapshot } from './companionDesktop'
import { availableIdleInterludes, chooseDifferentItem, configuredClipsForState, isSustainedVideoState, isTransientVideoState, nextIdleInterludeDelay } from './companionVideoPlayback'

type ReadyVisual = { id: string; kind: 'image' | 'video'; url: string }

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
  const assetIds = useMemo(() => companionVisualAssetIds(snapshot), [snapshot])
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

export function DesktopCompanionWindow() {
  const [snapshot, setSnapshot] = useState(emptyCompanionDesktopSnapshot)
  const [receivedSnapshot, setReceivedSnapshot] = useState(false)
  const [readyVisual, setReadyVisual] = useState<ReadyVisual>()
  const [outgoingVisual, setOutgoingVisual] = useState<ReadyVisual>()
  const [selectedVideoId, setSelectedVideoId] = useState<string>()
  const [idleInterlude, setIdleInterlude] = useState<CompanionVideoState>()
  const previousIdleInterlude = useRef<CompanionVideoState | undefined>(undefined)
  const visualTransitionTimer = useRef<number | undefined>(undefined)
  const pointerStart = useRef<{ x: number; y: number } | undefined>(undefined)
  const pointerId = useRef<number | undefined>(undefined)
  const dragged = useRef(false)
  const urls = useDesktopVisualUrls(snapshot)
  useEffect(() => {
    let stopSnapshot: (() => void) | undefined
    void listen<CompanionDesktopSnapshot>('companion:snapshot', (event) => {
      setSnapshot(event.payload)
      setReceivedSnapshot(true)
    }).then((value) => { stopSnapshot = value; void emitTo('main', 'companion:ready') })
    return () => { stopSnapshot?.() }
  }, [])
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
  const displayedAction = idleInterlude ?? snapshot.action
  const videoCandidates = useMemo(() => clipsForState(snapshot, displayedAction), [displayedAction, snapshot])
  useEffect(() => {
    if (snapshot.visual.type !== 'video') { setSelectedVideoId(undefined); return }
    setSelectedVideoId((current) => videoCandidates.includes(current ?? '') ? current : chooseDifferentItem(videoCandidates, current))
  }, [displayedAction, snapshot.visual, videoCandidates])
  useEffect(() => {
    if (snapshot.action !== 'idle') setIdleInterlude(undefined)
  }, [snapshot.action])
  useEffect(() => {
    if (snapshot.visual.type !== 'video' || snapshot.action !== 'idle' || idleInterlude) return
    const available = availableIdleInterludes(snapshot.visual)
    if (!available.length) return
    const timer = window.setTimeout(() => {
      const next = chooseDifferentItem(available, previousIdleInterlude.current)
      if (!next) return
      previousIdleInterlude.current = next
      setIdleInterlude(next)
    }, nextIdleInterludeDelay())
    return () => window.clearTimeout(timer)
  }, [idleInterlude, snapshot.action, snapshot.visual])
  const videoId = snapshot.visual.type === 'video' ? selectedVideoId : undefined
  const videoUrl = videoId ? urls[videoId] : undefined
  const desiredVisual: ReadyVisual | undefined = videoId && videoUrl
    ? { id: videoId, kind: 'video', url: videoUrl }
    : snapshot.visual.type === 'portrait' && snapshot.visual.assetId && portraitUrl
      ? { id: snapshot.visual.assetId, kind: 'image', url: portraitUrl }
      : undefined
  const isChangingVisual = Boolean(desiredVisual && desiredVisual.id !== readyVisual?.id)
  const hasConfiguredVisual = snapshot.visual.type === 'video'
    ? clipsForState(snapshot, 'idle').length > 0
    : snapshot.visual.type === 'portrait'
      ? Boolean(snapshot.visual.assetId)
      : true
  useEffect(() => {
    if (!receivedSnapshot || hasConfiguredVisual) return
    window.clearTimeout(visualTransitionTimer.current)
    setOutgoingVisual(undefined)
    setReadyVisual(undefined)
  }, [hasConfiguredVisual, receivedSnapshot])
  useEffect(() => () => window.clearTimeout(visualTransitionTimer.current), [])
  const markReady = (next: ReadyVisual) => {
    if (next.id !== desiredVisual?.id || next.id === readyVisual?.id) return
    window.clearTimeout(visualTransitionTimer.current)
    setOutgoingVisual(readyVisual)
    setReadyVisual(next)
    visualTransitionTimer.current = window.setTimeout(() => setOutgoingVisual(undefined), 180)
    void emitTo('main', 'companion:visual-ready', { assetId: next.id })
  }
  const reportLoadError = (assetId: string) => {
    void emitTo('main', 'companion:visual-error', { assetId })
  }
  const advanceIdle = () => {
    if (readyVisual?.id !== selectedVideoId) return
    if (isTransientVideoState(displayedAction)) {
      if (idleInterlude === displayedAction) setIdleInterlude(undefined)
      else void emitTo('main', 'companion:transient-ended', { state: displayedAction })
      return
    }
    if (displayedAction !== 'idle' || videoCandidates.length < 2) return
    setSelectedVideoId((current) => chooseDifferentItem(videoCandidates, current))
  }
  const loopVideo = isSustainedVideoState(displayedAction) && (displayedAction !== 'idle' || videoCandidates.length < 2)
  const visual = <>
    {outgoingVisual && outgoingVisual.id !== readyVisual?.id && (outgoingVisual.kind === 'video'
      ? <video className="desktop-media outgoing" key={outgoingVisual.id} src={outgoingVisual.url} autoPlay loop muted playsInline draggable={false} />
      : <img className="desktop-media outgoing" key={outgoingVisual.id} src={outgoingVisual.url} alt="" draggable={false} />)}
    {readyVisual && (readyVisual.kind === 'video'
      ? <video className="desktop-media ready" key={readyVisual.id} src={readyVisual.url} autoPlay loop={loopVideo} muted playsInline draggable={false} onEnded={advanceIdle} />
      : <img className="desktop-media ready" key={readyVisual.id} src={readyVisual.url} alt="" draggable={false} />)}
    {isChangingVisual && desiredVisual && (desiredVisual.kind === 'video'
      ? <video className="desktop-media pending" key={desiredVisual.id} src={desiredVisual.url} autoPlay loop={loopVideo} muted playsInline preload="auto" draggable={false} onPlaying={() => markReady(desiredVisual)} onError={() => reportLoadError(desiredVisual.id)} />
      : <img className="desktop-media pending" key={desiredVisual.id} src={desiredVisual.url} alt="" draggable={false} onLoad={() => markReady(desiredVisual)} onError={() => reportLoadError(desiredVisual.id)} />)}
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
  return <main className={`desktop-companion mode-${snapshot.desktopMode} action-${snapshot.action}`}>
    <div className="desktop-visual">{visual}<div className="desktop-interaction-layer" role="button" tabIndex={0} onPointerDown={beginPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={cancelPointer} onDoubleClick={() => void emitTo('main', 'companion:open-main')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') void emitTo('main', 'companion:chat-toggle') }} aria-label={`${snapshot.name}，${snapshot.actionLabel}`} /></div>
  </main>
}
