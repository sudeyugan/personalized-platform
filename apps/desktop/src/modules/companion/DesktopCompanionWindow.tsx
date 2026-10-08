import type { CompanionHeartRateInput } from '../heart-rate/companionHeartRate'
import type { ListeningInput } from '../music-companion/listeningNotice'
import { needsTaskConfirmation } from './feedback/taskFeedback'
import { ListeningBadge } from '../music-companion/ListeningBadge'
import { HeartRateBadge } from '../heart-rate/HeartRateBadge'
import { normalizeCompanionPetSide } from '../../domain/companionPetStyle'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useMemo, useRef, useState } from 'react'
import { emptyCompanionDesktopSnapshot, type CompanionDesktopSnapshot } from './companionDesktop'
import { DesktopWebMRenderer, type PreviewVideoRequest } from './DesktopWebMRenderer'
import { useCompanionPlacement } from './pixel-pet/useCompanionPlacement'
import { PixelPetWindow } from './pixel-pet/PixelPetWindow'
import { createPixelWindowLayout, type PixelLayout } from './pixel-pet/windowLayout'

export function DesktopCompanionWindow() {
  const [snapshot, setSnapshot] = useState(emptyCompanionDesktopSnapshot)
  const [receivedSnapshot, setReceivedSnapshot] = useState(false)
  const [preview, setPreview] = useState<PreviewVideoRequest>()
  const sequence = useRef(0)
  const listeningInput = useMemo<ListeningInput>(() => ({ playing: { current: false }, marker: { current: null } }), [])
  const heartInput = useMemo<CompanionHeartRateInput>(() => ({ sample: { current: null }, marker: { current: null } }), [])
  const [layout, setLayout] = useState<PixelLayout>({ scale: 1, pixelRatio: 1, ready: false })
  const [layoutError, setLayoutError] = useState('')
  const nativeLayout = useMemo(() => createPixelWindowLayout(getCurrentWindow()), [])
  const drag = useCompanionPlacement(nativeLayout, setLayout, receivedSnapshot)
  const pixelEnabled = snapshot.pixelPetEnabled && !preview
  const pixelSide = normalizeCompanionPetSide(snapshot.pixelPetSide)
  useEffect(() => {
    let disposed = false
    const stops: (() => void)[] = []
    const keep = (stop: () => void) => { if (disposed) stop(); else stops.push(stop) }
    void listen<CompanionDesktopSnapshot>('companion:snapshot', ({ payload }) => {
      if (disposed) return
      setSnapshot(payload); setReceivedSnapshot(true)
    }).then((stop) => { keep(stop); if (!disposed) void emitTo('main', 'companion:ready') })
    void listen<{ assetId: string }>('companion:preview-video', ({ payload }) => {
      if (disposed || !payload.assetId) return
      setPreview({ assetId: payload.assetId, instanceKey: `preview:${++sequence.current}:${payload.assetId}` })
    }).then(keep)
    return () => { disposed = true; stops.forEach((stop) => stop()) }
  }, [])
  useEffect(() => {
    if (!receivedSnapshot) return
    let disposed = false
    setLayoutError('')
    void nativeLayout.apply(pixelEnabled, pixelSide).then((next) => { if (!disposed) setLayout(next) })
      .catch((error: unknown) => { if (!disposed) setLayoutError(error instanceof Error ? error.message : String(error)) })
    return () => { disposed = true }
  }, [nativeLayout, pixelEnabled, pixelSide, receivedSnapshot])
  useEffect(() => () => { void nativeLayout.apply(false).catch(() => undefined) }, [nativeLayout])
  const heartRate = <HeartRateBadge visible={snapshot.desktopVisible && (!pixelEnabled || layout.ready)}
    variant={pixelEnabled ? 'pixel' : 'webm'} style={snapshot.pixelPetStyle} input={heartInput} pose={drag.dragging ? 'float' : layout.pose ?? layout.side ?? pixelSide} />
  const listening = <ListeningBadge input={listeningInput} visible={snapshot.desktopVisible && (!pixelEnabled || layout.ready)} pixel={pixelEnabled} side={drag.dragging ? 'float' : layout.pose ?? layout.side ?? pixelSide} quiet={snapshot.desktopMode === 'quiet'} busy={drag.dragging || Boolean(snapshot.agentStatus && snapshot.agentStatus.phase !== 'error') || ['listening', 'speaking'].includes(snapshot.action) || ['running', 'preparing'].includes(snapshot.task?.status ?? '') || Boolean(snapshot.task && needsTaskConfirmation(snapshot.task))} />
  if (pixelEnabled) return <>{heartRate}{listening}<PixelPetWindow snapshot={snapshot} layout={layout} drag={drag} heartInput={heartInput} listeningInput={listeningInput} onPose={async (pose) => {
    const next = pose === 'float' ? await nativeLayout.float() : await nativeLayout.apply(true, pose, true)
    setLayout(next)
    if (pose !== 'float') await emitTo('main', 'companion:pet-menu-action', { kind: 'side', value: pose })
    await emitTo('main', 'companion:moved')
  }} />{layoutError && <small className="pixel-pet-error" role="status">{layoutError}</small>}</>
  return <>{heartRate}{listening}<DesktopWebMRenderer drag={drag} snapshot={snapshot} receivedSnapshot={receivedSnapshot} previewRequest={preview}
    onPreviewEnd={(key) => setPreview((current) => current?.instanceKey === key ? undefined : current)} /></>
}
