import { invoke } from '@tauri-apps/api/core'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { emitTo, listen } from '@tauri-apps/api/event'
import { availableMonitors, getCurrentWindow, type Monitor } from '@tauri-apps/api/window'
import { useEffect, useMemo, useRef, useState } from 'react'
import { companionVisualAssetIds, emptyCompanionDesktopSnapshot, type CompanionDesktopSnapshot } from './companionDesktop'

type ReadyVisual = { id: string; kind: 'image' | 'video'; url: string }

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
  const videoId = snapshot.visual.type === 'video' ? snapshot.visual.videos[snapshot.action] ?? snapshot.visual.videos.idle : undefined
  const videoUrl = videoId ? urls[videoId] : undefined
  const desiredVisual: ReadyVisual | undefined = videoId && videoUrl
    ? { id: videoId, kind: 'video', url: videoUrl }
    : snapshot.visual.type === 'portrait' && snapshot.visual.assetId && portraitUrl
      ? { id: snapshot.visual.assetId, kind: 'image', url: portraitUrl }
      : undefined
  const isChangingVisual = Boolean(desiredVisual && desiredVisual.id !== readyVisual?.id)
  const hasConfiguredVisual = snapshot.visual.type === 'video'
    ? Boolean(videoId)
    : snapshot.visual.type === 'portrait'
      ? Boolean(snapshot.visual.assetId)
      : true
  useEffect(() => {
    if (receivedSnapshot && !hasConfiguredVisual) setReadyVisual(undefined)
  }, [hasConfiguredVisual, receivedSnapshot])
  const markReady = (next: ReadyVisual) => {
    setReadyVisual(next)
    void emitTo('main', 'companion:visual-ready', { assetId: next.id })
  }
  const reportLoadError = (assetId: string) => {
    void emitTo('main', 'companion:visual-error', { assetId })
  }
  const visual = <>
    {readyVisual && (readyVisual.kind === 'video'
      ? <video className="desktop-media ready" key={readyVisual.id} src={readyVisual.url} autoPlay loop muted playsInline draggable={false} />
      : <img className="desktop-media ready" key={readyVisual.id} src={readyVisual.url} alt="" draggable={false} />)}
    {isChangingVisual && desiredVisual && (desiredVisual.kind === 'video'
      ? <video className="desktop-media pending" key={desiredVisual.id} src={desiredVisual.url} autoPlay loop muted playsInline preload="auto" draggable={false} onCanPlay={() => markReady(desiredVisual)} onError={() => reportLoadError(desiredVisual.id)} />
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
  return <main className={`desktop-companion action-${snapshot.action}`}>
    <div className="desktop-visual">{visual}<div className="desktop-interaction-layer" role="button" tabIndex={0} onPointerDown={beginPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={cancelPointer} onDoubleClick={() => void emitTo('main', 'companion:open-main')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') void emitTo('main', 'companion:chat-toggle') }} aria-label={`${snapshot.name}，${snapshot.actionLabel}`} /></div>
  </main>
}
