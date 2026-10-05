import { emitTo } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { CompanionDesktopSnapshot } from '../companionDesktop'
import { normalizeCompanionPetStyle } from '../../../domain/companionPetStyle'
import { isPetHead } from './headHit'
import { petConversationState } from './conversation'
import type { NativePetDragHandlers } from './useNativePetDrag'
import { PixelPetRenderer } from './PixelPetRenderer'
import { PetContextMenu } from './PetContextMenu'
import { usePixelPetInteraction } from './usePixelPetInteraction'
import { usePixelPetPointer } from './usePixelPetPointer'
import type { PixelLayout } from './windowLayout'
import type { CompanionPetSide } from '../../../domain/models'
import type { PixelPoint } from './types'

interface Props {
  snapshot: CompanionDesktopSnapshot; layout: PixelLayout
  drag?: NativePetDragHandlers & { dragging?: boolean; motion?: RefObject<PixelPoint> }
  onPose?: (pose: CompanionPetSide | 'float') => Promise<void>
}
export function PixelPetWindow({ snapshot, layout, drag, onPose }: Props) {
  const response = useRef(0)
  const headPat = useRef(0)
  const [menu, setMenu] = useState<PixelPoint | null>(null)
  const [menuError, setMenuError] = useState('')
  const closeMenu = useCallback(() => setMenu(null), [])
  const { pointer, error } = usePixelPetPointer(snapshot.desktopVisible && layout.ready)
  const pose = drag?.dragging ? 'float' : layout.pose ?? layout.side ?? 'right-edge'
  const { error: dragError, ...interaction } = usePixelPetInteraction(point => {
    if (isPetHead(point, normalizeCompanionPetStyle(snapshot.pixelPetStyle), pose)) { headPat.current++; return true }
    response.current++
  }, drag)
  useEffect(() => {
    const appWindow = getCurrentWindow()
    void Promise.all([appWindow.setIgnoreCursorEvents(snapshot.desktopMode === 'quiet'), appWindow.setAlwaysOnTop(snapshot.desktopMode !== 'normal')]).catch(() => undefined)
  }, [snapshot.desktopMode])
  useEffect(() => { closeMenu() }, [closeMenu, snapshot.desktopVisible, snapshot.desktopMode, snapshot.pixelPetStyle, pose])
  const fail = () => setMenuError('操作暂未完成，请重试或从主界面设置。')
  return <main className={`desktop-companion pixel-pet-window pose-${pose} mode-${snapshot.desktopMode}`} style={{ opacity: layout.ready ? undefined : 0 }}>
    <PixelPetRenderer name={snapshot.name} engaged={Boolean(menu)} dragging={drag?.dragging} dragMotion={drag?.motion} conversation={petConversationState(snapshot)}
      pose={pose} response={response} headPat={headPat} style={snapshot.pixelPetStyle} pointer={pointer} scale={layout.scale} pixelRatio={layout.pixelRatio} active={snapshot.desktopVisible && layout.ready} />
    <button className="pixel-pet-interaction" aria-label={`${snapshot.name}，拖动移动，轻点头部回应或点击身体打开对话；右键打开菜单`} {...interaction}
      onPointerDown={event => { if (menu) { closeMenu(); return }; interaction.onPointerDown(event) }}
      onContextMenu={event => { event.preventDefault(); response.current++; setMenuError(''); setMenu({ x: event.clientX, y: event.clientY }) }} />
    {menu && <PetContextMenu name={snapshot.name} point={menu} style={normalizeCompanionPetStyle(snapshot.pixelPetStyle)} pose={pose} onClose={closeMenu}
      onAction={action => { void emitTo('main', 'companion:pet-menu-action', action).catch(fail) }}
      onPose={value => { void onPose?.(value).catch(fail) }} />}
    {(error || dragError || menuError) && <small className="pixel-pet-error" role="status">{error || dragError || menuError}</small>}
  </main>
}
