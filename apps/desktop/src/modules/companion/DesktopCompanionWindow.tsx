import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useMemo, useRef, useState } from 'react'
import { emptyCompanionDesktopSnapshot, type CompanionDesktopSnapshot } from './companionDesktop'
import { DesktopWebMRenderer, type PreviewVideoRequest } from './DesktopWebMRenderer'
import { PixelPetWindow } from './pixel-pet/PixelPetWindow'
import { createPixelWindowLayout, type PixelLayout } from './pixel-pet/windowLayout'

export function DesktopCompanionWindow() {
  const [snapshot, setSnapshot] = useState(emptyCompanionDesktopSnapshot)
  const [receivedSnapshot, setReceivedSnapshot] = useState(false)
  const [preview, setPreview] = useState<PreviewVideoRequest>()
  const sequence = useRef(0)
  const [layout, setLayout] = useState<PixelLayout>({ scale: 2, pixelRatio: 1, ready: false })
  const [layoutError, setLayoutError] = useState('')
  const nativeLayout = useMemo(() => createPixelWindowLayout(getCurrentWindow()), [])
  const pixelEnabled = snapshot.pixelPetEnabled && !preview
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
    let disposed = false
    setLayoutError('')
    void nativeLayout.apply(pixelEnabled).then((next) => { if (!disposed) setLayout(next) })
      .catch((error: unknown) => { if (!disposed) setLayoutError(error instanceof Error ? error.message : String(error)) })
    return () => { disposed = true }
  }, [nativeLayout, pixelEnabled])
  useEffect(() => () => { void nativeLayout.apply(false).catch(() => undefined) }, [nativeLayout])
  if (pixelEnabled) return <><PixelPetWindow snapshot={snapshot} layout={layout} />{layoutError && <small className="pixel-pet-error" role="status">{layoutError}</small>}</>
  return <DesktopWebMRenderer snapshot={snapshot} receivedSnapshot={receivedSnapshot} previewRequest={preview}
    onPreviewEnd={(key) => setPreview((current) => current?.instanceKey === key ? undefined : current)} />
}
