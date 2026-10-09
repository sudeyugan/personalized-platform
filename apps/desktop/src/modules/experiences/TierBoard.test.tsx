import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { defaultTierLabels, rankExperience, type ExperienceEntry } from '../../domain/experiences'
import { TierBoard } from './TierBoard'

vi.mock('./ExperienceArtwork', () => ({ ExperienceArtwork: ({ entry }: { entry: ExperienceEntry }) => <img alt={entry.title + '封面'} /> }))

class TestPointerEvent extends MouseEvent {
  pointerId: number
  isPrimary: boolean
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.isPrimary = init.isPrimary ?? true
  }
}
const hit = vi.fn()
const capture = vi.fn(), release = vi.fn()
const properties = ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture'] as const
const originalCapture = properties.map(key => Object.getOwnPropertyDescriptor(HTMLElement.prototype, key))
const originalHit = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')
const entries: ExperienceEntry[] = ['甲', '乙', '丙'].map((title, order) => ({ id: title, title, order, category: 'novel', creator: '', dateText: '', note: '', paperStyle: 'linen', tier: order < 2 ? 'top' : undefined, createdAt: '', updatedAt: '' }))

function setup() {
  const rank = vi.fn(), open = vi.fn()
  function Board() {
    const [items, setItems] = useState(entries)
    return <TierBoard entries={items} assets={[]} labels={defaultTierLabels} rank={(...args) => { rank(...args); setItems(current => rankExperience(current, ...args)) }} rename={vi.fn()} onOpen={open} />
  }
  const { container, unmount } = render(<Board />)
  return { rank, open, container, unmount }
}
const pointer = { pointerId: 1, button: 0, clientX: 20, clientY: 20 }
const button = (title: string) => screen.getByRole('button', { name: '查看' + title })
function move(source: HTMLElement, target: Element | null, x = 100, y = 100) {
  hit.mockReturnValue(target)
  fireEvent.pointerMove(source, { ...pointer, clientX: x, clientY: y })
}
function finish(source: HTMLElement, x = 100, y = 100) {
  fireEvent.pointerUp(source, { ...pointer, clientX: x, clientY: y })
}

describe('tier board pointer dragging in desktop-compatible mode', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', TestPointerEvent)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: hit })
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: { configurable: true, value: capture },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: release },
    })
    hit.mockReset(); capture.mockClear(); release.mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals(); vi.restoreAllMocks()
    if (originalHit) Object.defineProperty(document, 'elementFromPoint', originalHit)
    else Reflect.deleteProperty(document, 'elementFromPoint')
    properties.forEach((key, index) => {
      if (originalCapture[index]) Object.defineProperty(HTMLElement.prototype, key, originalCapture[index]!)
      else Reflect.deleteProperty(HTMLElement.prototype, key)
    })
  })

  it('moves a cover into an empty tier, persists through rerender, and suppresses the trailing click', () => {
    const { rank, open, container } = setup(), source = button('丙')
    const row = container.querySelector('[data-tier="great"]')!
    fireEvent.pointerDown(source, pointer)
    move(source, row)
    expect(row).toHaveClass('is-drop-target')
    expect(container.querySelector('.tier-drag-preview')).toBeInTheDocument()
    finish(source)
    expect(rank).toHaveBeenCalledExactlyOnceWith('丙', 'great', undefined)
    expect(within(row as HTMLElement).getByRole('button', { name: '查看丙' })).toBeInTheDocument()
    expect(button('丙').closest('[data-tier]')).toHaveAttribute('data-tier', 'great')
    fireEvent.click(button('丙'), { detail: 1 })
    expect(open).not.toHaveBeenCalled()
    expect(capture).toHaveBeenCalledWith(1)
    expect(release).toHaveBeenCalledWith(1)
    expect(container.querySelector('.tier-drag-preview')).not.toBeInTheDocument()
  })

  it('anchors the floating cover at the original grab point instead of offsetting it beside the pointer', () => {
    const { container } = setup(), source = button('甲')
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 15, width: 90 } as DOMRect)
    fireEvent.pointerDown(source, pointer)
    move(source, container.querySelector('[data-tier="poor"]'), 110, 115)
    expect(container.querySelector('.tier-drag-preview')).toHaveStyle({ width: '90px', transform: 'translate3d(100px, 110px, 0)' })
    expect(container.querySelector('.tier-drag-preview-cover')).toHaveStyle({ transformOrigin: '10px 5px' })
    fireEvent.pointerCancel(source, pointer)
  })

  it.each([false, true])('settles the released cover but respects reduced motion: %s', reduced => {
    let nextFrame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { nextFrame = callback; return 42 })
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: reduced }))
    const { container, rank } = setup(), source = button('丙')
    const original = { left: 10, top: 15, width: 90 } as DOMRect
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(original)
    fireEvent.pointerDown(source, pointer)
    move(source, container.querySelector('[data-tier="good"]'), 110, 115)
    finish(source, 110, 115)
    const destination = button('丙'), animate = vi.fn()
    Object.defineProperty(destination, 'animate', { configurable: true, value: animate })
    vi.spyOn(destination, 'getBoundingClientRect').mockReturnValue({ left: 90, top: 100 } as DOMRect)
    act(() => nextFrame?.(16))
    expect(rank).toHaveBeenCalledExactlyOnceWith('丙', 'good', undefined)
    if (reduced) expect(animate).not.toHaveBeenCalled()
    else expect(animate).toHaveBeenCalledExactlyOnceWith([
      { transform: 'translate(10px, 10px) scale(1.035)', opacity: .85 },
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    ], { duration: 240, easing: 'cubic-bezier(.2,.75,.25,1)' })
  })

  it('keeps the row label but no dropdown or ranking buttons under covers', () => {
    const { container } = setup()
    const card = button('甲').closest('article')!
    expect(within(card).getAllByRole('button')).toHaveLength(1)
    expect(within(card).queryByRole('combobox')).not.toBeInTheDocument()
    expect(card.querySelector('.tier-mini-actions')).not.toBeInTheDocument()
    expect(container.querySelector('[data-tier="good"] .tier-board-label')).toHaveTextContent('人上人')
    expect(screen.queryByText('也可以用卡片下方的按钮调整。')).not.toBeInTheDocument()
  })

  it.each([{ x: 110, before: '甲', order: ['乙', '甲'] }, { x: 180, before: undefined, order: ['甲', '乙'] }])('uses the hovered cover midpoint to insert before or after: $x', ({ x, before, order }) => {
    const { rank, container } = setup(), source = button('乙'), target = button('甲')
    vi.spyOn(target.closest('article')!, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 90 } as DOMRect)
    fireEvent.pointerDown(source, pointer)
    move(source, target, x)
    finish(source, x)
    expect(rank).toHaveBeenCalledExactlyOnceWith('乙', 'top', before)
    expect([...container.querySelectorAll('[data-tier="top"] [data-tier-entry]')].map(card => card.getAttribute('data-tier-entry'))).toEqual(order)
  })

  it('can return a ranked work to the unranked row', () => {
    const { rank, container } = setup(), source = button('甲')
    fireEvent.pointerDown(source, pointer)
    move(source, container.querySelector('[data-tier="unranked"]'))
    finish(source)
    expect(rank).toHaveBeenCalledExactlyOnceWith('甲', undefined, undefined)
    expect(button('甲').closest('[data-tier]')).toHaveAttribute('data-tier', 'unranked')
  })

  it('keeps clicks, keyboard activation and small pointer movements opening the editor', () => {
    const { rank, open } = setup(), source = button('甲')
    fireEvent.pointerDown(source, pointer)
    fireEvent.pointerMove(source, { ...pointer, clientX: 22, clientY: 21 })
    fireEvent.pointerUp(source, { ...pointer, clientX: 22, clientY: 21 })
    fireEvent.click(source, { detail: 1 })
    fireEvent.click(source, { detail: 0 })
    expect(open).toHaveBeenCalledTimes(2)
    expect(rank).not.toHaveBeenCalled()
  })

  it.each(['escape', 'pointercancel', 'lostpointercapture', 'blur', 'outside', 'self'])('cancels without saving on %s', kind => {
    const { rank, container } = setup(), source = button('甲')
    fireEvent.pointerDown(source, pointer)
    move(source, container.querySelector('[data-tier="poor"]'))
    if (kind === 'escape') fireEvent.keyDown(window, { key: 'Escape' })
    if (kind === 'pointercancel') fireEvent.pointerCancel(source, pointer)
    if (kind === 'lostpointercapture') fireEvent.lostPointerCapture(source, pointer)
    if (kind === 'blur') fireEvent.blur(window)
    if (kind === 'outside') hit.mockReturnValue(document.body)
    if (kind === 'self') hit.mockReturnValue(source)
    finish(source)
    expect(rank).not.toHaveBeenCalled()
    expect(container.querySelector('.tier-drag-preview')).not.toBeInTheDocument()
  })

  it('ignores secondary buttons and unrelated pointers and keeps click-to-edit intact', () => {
    const { rank, open, container } = setup(), source = button('甲')
    fireEvent.pointerDown(source, { ...pointer, button: 2 })
    move(source, container.querySelector('[data-tier="poor"]'))
    finish(source)
    fireEvent.pointerDown(source, pointer)
    fireEvent.pointerMove(source, { ...pointer, pointerId: 2, clientX: 100 })
    fireEvent.pointerUp(source, { ...pointer, pointerId: 2 })
    fireEvent.pointerCancel(source, pointer)
    expect(rank).not.toHaveBeenCalled()
    fireEvent.click(source)
    expect(open).toHaveBeenCalledExactlyOnceWith('甲')
    expect(source.closest('article')).not.toHaveAttribute('draggable')
  })

  it('scrolls the actual page container near its edges and stops scheduling when the board unmounts', () => {
    let nextFrame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { nextFrame = callback; return 42 })
    const stopFrame = vi.spyOn(window, 'cancelAnimationFrame')
    const { container, rank, unmount } = setup(), source = button('甲')
    container.style.overflowY = 'auto'
    Object.defineProperties(container, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 200 } })
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 200, left: 0, right: 400 } as DOMRect)
    fireEvent.pointerDown(source, pointer)
    move(source, container.querySelector('[data-tier="poor"]'), 100, 190)
    act(() => nextFrame?.(16))
    expect(container.scrollTop).toBe(10)
    move(source, container.querySelector('[data-tier="top"]'), 100, 10)
    act(() => nextFrame?.(32))
    expect(container.scrollTop).toBe(0)
    unmount()
    expect(stopFrame).toHaveBeenCalledWith(42)
    expect(rank).not.toHaveBeenCalled()
  })
})
