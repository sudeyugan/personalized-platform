import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect } from 'react'
import type { CompanionDesktopSnapshot } from '../companionDesktop'
import { PixelPetRenderer } from './PixelPetRenderer'
import { usePixelPetInteraction } from './usePixelPetInteraction'
import { usePixelPetPointer } from './usePixelPetPointer'
import type { PixelLayout } from './windowLayout'

export function PixelPetWindow({ snapshot, layout }: { snapshot: CompanionDesktopSnapshot; layout: PixelLayout }) {
  const { error: dragError, ...interaction } = usePixelPetInteraction()
  const { pointer, error } = usePixelPetPointer(snapshot.desktopVisible && layout.ready)
  useEffect(() => {
    const appWindow = getCurrentWindow()
    void Promise.all([appWindow.setIgnoreCursorEvents(snapshot.desktopMode === 'quiet'), appWindow.setAlwaysOnTop(snapshot.desktopMode !== 'normal')]).catch(() => undefined)
  }, [snapshot.desktopMode])
  return <main className={`desktop-companion pixel-pet-window mode-${snapshot.desktopMode}`} style={{ opacity: layout.ready ? undefined : 0 }}>
    <PixelPetRenderer pointer={pointer} scale={layout.scale} pixelRatio={layout.pixelRatio} active={snapshot.desktopVisible && layout.ready} />
    <button className="pixel-pet-interaction" aria-label={`${snapshot.name}，拖动移动或点击打开对话`} {...interaction} />
    {(error || dragError) && <small className="pixel-pet-error" role="status">{error || dragError}</small>}
  </main>
}
