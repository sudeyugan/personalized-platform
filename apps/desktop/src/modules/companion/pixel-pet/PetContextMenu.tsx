import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { CompanionPetSide, CompanionPetStyle } from '../../../domain/models'
import type { PetMenuAction } from './menuActions'
import type { PixelPoint, PixelPetPose } from './types'
import { PET_STYLES } from './art/artProfiles'

interface Props {
  name?: string
  point: PixelPoint; style: CompanionPetStyle; pose: PixelPetPose
  onAction: (action: PetMenuAction) => void
  onPose: (pose: CompanionPetSide | 'float') => void
  onClose: () => void
}
export function PetContextMenu({ name = '小鱼', point, style, pose, onAction, onPose, onClose }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState<'main' | 'style' | 'pose'>('main')
  useEffect(() => {
    container.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [page])
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) onClose() }
    window.addEventListener('pointerdown', outside)
    window.addEventListener('blur', onClose)
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('blur', onClose) }
  }, [onClose])
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    const buttons = Array.from(container.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    let next: number | undefined
    if (event.key === 'ArrowDown' || event.key === 'Tab' && !event.shiftKey) next = (index + 1) % buttons.length
    if (event.key === 'ArrowUp' || event.key === 'Tab' && event.shiftKey) next = (index - 1 + buttons.length) % buttons.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = buttons.length - 1
    if (next !== undefined) { event.preventDefault(); buttons[next]?.focus() }
    if (event.key === 'ArrowLeft' && page !== 'main') { event.preventDefault(); setPage('main') }
  }
  const choose = (action: PetMenuAction) => { onAction(action); onClose() }
  const choosePose = (value: CompanionPetSide | 'float') => { onPose(value); onClose() }
  return <div ref={container} className="pet-context-menu" role="menu" aria-label={`${name}桌宠菜单`}
    style={{ left: Math.max(4, Math.min(point.x, window.innerWidth - 148)), top: Math.max(4, Math.min(point.y, window.innerHeight - 170)) }}
    onKeyDown={key} onContextMenu={event => event.preventDefault()}>
    {page === 'main' ? <>
      <span className="pet-menu-caption">{name} · 桌宠</span>
      <button role="menuitem" onClick={() => setPage('style')}>切换造型<span>›</span></button>
      <button role="menuitem" onClick={() => setPage('pose')}>摆放姿态<span>›</span></button>
      <button role="menuitem" onClick={() => choose({ kind: 'settings' })}>打开设置</button>
      <button role="menuitem" onClick={() => choose({ kind: 'hide' })}>暂时隐藏</button>
    </> : <>
      <button role="menuitem" onClick={() => setPage('main')}>‹ 返回</button>
      {page === 'style' ? PET_STYLES.map(item => <button key={item.style} role="menuitemradio" aria-checked={style === item.style}
        onClick={() => choose({ kind: 'style', value: item.style })}>{item.label}<span>{style === item.style ? '✓' : ''}</span></button>)
        : ([['float', '自然放置'], ['left-edge', '左侧扒边'], ['right-edge', '右侧扒边'], ['bottom-edge', '底部趴边']] as const).map(([value, label]) =>
          <button key={value} role="menuitemradio" aria-checked={pose === value} onClick={() => choosePose(value)}>{label}<span>{pose === value ? '✓' : ''}</span></button>)}
    </>}
  </div>
}
