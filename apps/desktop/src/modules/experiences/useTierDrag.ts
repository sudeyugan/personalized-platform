import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { tierIds, type ExperienceTier } from '../../domain/experiences'

interface DropTarget { tier?: ExperienceTier; key: string; beforeId?: string }
interface DragView { id: string; x: number; y: number; offsetX: number; offsetY: number; width: number; target?: DropTarget }
interface Gesture {
  id: string; pointerId: number; x: number; y: number; startX: number; startY: number
  active: boolean; button: HTMLButtonElement
  offsetX: number; offsetY: number; width: number
}

function animateDrop(board: HTMLElement, current: Gesture, previous: Map<string, DOMRect>) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  for (const card of board.querySelectorAll<HTMLElement>('[data-tier-entry]')) {
    const id = card.dataset.tierEntry!, dropped = id === current.id
    const element = dropped ? card.querySelector<HTMLElement>('.tier-mini-open') : card
    const old = previous.get(id)
    if (!element || !old) continue
    const rect = element.getBoundingClientRect()
    const x = (dropped ? current.x - current.offsetX : old.left) - rect.left
    const y = (dropped ? current.y - current.offsetY : old.top) - rect.top
    if (!dropped && Math.abs(x) < 1 && Math.abs(y) < 1) continue
    element.animate?.([
      { transform: `translate(${x}px, ${y}px) scale(${dropped ? 1.035 : 1})`, opacity: dropped ? .85 : 1 },
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    ], { duration: dropped ? 240 : 200, easing: 'cubic-bezier(.2,.75,.25,1)' })
  }
}

function dropTarget(board: HTMLElement, gesture: Gesture): DropTarget | undefined {
  const hit = document.elementFromPoint(gesture.x, gesture.y)
  const row = hit?.closest<HTMLElement>('[data-tier]')
  if (!row || !board.contains(row)) return undefined
  const key = row.dataset.tier!
  if (key !== 'unranked' && !tierIds.includes(key as ExperienceTier)) return undefined
  const card = hit?.closest<HTMLElement>('[data-tier-entry]')
  if (card?.dataset.tierEntry === gesture.id) return undefined
  const members = [...row.querySelectorAll<HTMLElement>('[data-tier-entry]')].filter(item => item.dataset.tierEntry !== gesture.id)
  let beforeId = card?.dataset.tierEntry
  if (card) {
    const rect = card.getBoundingClientRect()
    if (gesture.x >= rect.left + rect.width / 2) beforeId = members[members.indexOf(card) + 1]?.dataset.tierEntry
  }
  return { key, tier: key === 'unranked' ? undefined : key as ExperienceTier, beforeId }
}

function scrollContainer(board: HTMLElement): HTMLElement {
  for (let parent = board.parentElement; parent; parent = parent.parentElement) {
    if (parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement
}

// Pointer dragging avoids Windows WebView's native file-drop interception of HTML5 drag events.
export function useTierDrag(rank: (id: string, tier: ExperienceTier | undefined, beforeId?: string) => void) {
  const boardRef = useRef<HTMLElement>(null)
  const gesture = useRef<Gesture | undefined>(undefined)
  const frame = useRef<number | undefined>(undefined)
  const suppressClick = useRef(false)
  const [drag, setDrag] = useState<DragView>()

  function cancel() {
    const current = gesture.current
    gesture.current = undefined
    if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    frame.current = undefined
    setDrag(undefined)
    if (current?.button.hasPointerCapture(current.pointerId)) current.button.releasePointerCapture(current.pointerId)
  }

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    window.addEventListener('keydown', escape)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', escape)
      window.removeEventListener('blur', cancel)
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    }
  }, [])

  function update(current: Gesture) {
    if (boardRef.current) setDrag({ id: current.id, x: current.x, y: current.y, offsetX: current.offsetX, offsetY: current.offsetY, width: current.width, target: dropTarget(boardRef.current, current) })
  }

  function autoScroll() {
    const current = gesture.current, board = boardRef.current
    if (!current?.active || !board) return
    const container = scrollContainer(board)
    const rect = container === document.scrollingElement || container === document.documentElement
      ? { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
      : container.getBoundingClientRect()
    if (current.x >= rect.left && current.x <= rect.right && current.y >= rect.top && current.y <= rect.bottom) {
      const speed = current.y < rect.top + 40 ? -10 : current.y > rect.bottom - 40 ? 10 : 0
      if (speed) { container.scrollTop += speed; update(current) }
    }
    frame.current = requestAnimationFrame(autoScroll)
  }

  return {
    boardRef, drag,
    start(event: PointerEvent<HTMLButtonElement>, id: string) {
      if (event.button !== 0 || event.isPrimary === false || gesture.current) return
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
      frame.current = undefined
      const rect = event.currentTarget.getBoundingClientRect()
      suppressClick.current = false
      gesture.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width || 90, active: false, button: event.currentTarget }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    move(event: PointerEvent<HTMLButtonElement>) {
      const current = gesture.current
      if (!current || current.pointerId !== event.pointerId) return
      current.x = event.clientX; current.y = event.clientY
      if (!current.active && Math.hypot(current.x - current.startX, current.y - current.startY) < 6) return
      if (!current.active) {
        current.active = true; suppressClick.current = true
        frame.current = requestAnimationFrame(autoScroll)
      }
      event.preventDefault()
      update(current)
    },
    end(event: PointerEvent<HTMLButtonElement>) {
      const current = gesture.current
      if (!current || current.pointerId !== event.pointerId) return
      current.x = event.clientX; current.y = event.clientY
      const target = current.active && boardRef.current ? dropTarget(boardRef.current, current) : undefined
      const previous = new Map(target ? [...boardRef.current!.querySelectorAll<HTMLElement>('[data-tier-entry]')].map(card => [card.dataset.tierEntry!, card.getBoundingClientRect()] as const) : [])
      if (current.active) event.preventDefault()
      cancel()
      if (target) {
        rank(current.id, target.tier, target.beforeId)
        frame.current = requestAnimationFrame(() => {
          frame.current = undefined
          if (boardRef.current) animateDrop(boardRef.current, current, previous)
        })
      }
    },
    cancel(event: PointerEvent<HTMLButtonElement>) {
      if (gesture.current?.pointerId === event.pointerId) cancel()
    },
    open(event: MouseEvent<HTMLButtonElement>, id: string, onOpen: (id: string) => void) {
      if (suppressClick.current && event.detail !== 0) { event.preventDefault(); return }
      onOpen(id)
    },
  }
}
