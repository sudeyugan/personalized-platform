import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TruthView } from './TruthView'

describe('TruthView', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('shows a single deck without scene selectors or an answer input', () => {
    const { container } = render(<TruthView />)
    expect(screen.getByRole('heading', { name: /真心话/ })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(container.querySelector('.truth-question blockquote')).toHaveTextContent('')
    fireEvent.click(screen.getByRole('button', { name: '翻开一张' }))
    expect(container.querySelector('.truth-question blockquote')?.textContent).toBeTruthy()
    expect(container.querySelector('.truth-card')).toHaveClass('turned')
    expect(screen.getByText('第 1 轮 · 已翻开 1 / 150 张')).toBeInTheDocument()
  })
  it('consumes skipped cards, exhausts a full round and shuffles without adjacent duplicates', () => {
    const { container } = render(<TruthView />)
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const seen = new Set<string>()
    fireEvent.click(screen.getByRole('button', { name: '翻开一张' }))
    seen.add(container.querySelector('blockquote')!.textContent!)
    fireEvent.click(screen.getByRole('button', { name: '这题先跳过' }))
    seen.add(container.querySelector('blockquote')!.textContent!)
    for (let index = 2; index < 150; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: '下一张' }))
      seen.add(container.querySelector('blockquote')!.textContent!)
    }
    expect(seen.size).toBe(150)
    expect(screen.getByText('第 1 轮 · 已翻开 150 / 150 张')).toBeInTheDocument()
    const last = container.querySelector('blockquote')!.textContent
    fireEvent.click(screen.getByRole('button', { name: '下一张' }))
    expect(screen.getByText('第 2 轮 · 已翻开 1 / 150 张')).toBeInTheDocument()
    expect(container.querySelector('blockquote')!.textContent).not.toBe(last)
  })
  it('turns every next/skip card and replaces text only after reaching the back', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const { container, unmount } = render(<TruthView />)
    fireEvent.click(screen.getByRole('button', { name: '翻开一张' }))
    expect(container.querySelector('.truth-card')).toHaveStyle({ transform: 'rotateY(180deg)' })
    expect(screen.getByRole('button', { name: '下一张' })).toBeDisabled()
    act(() => vi.advanceTimersByTime(850))
    const first = container.querySelector('blockquote')!.textContent
    fireEvent.click(screen.getByRole('button', { name: '下一张' }))
    expect(container.querySelector('.truth-card')).toHaveStyle({ transform: 'rotateY(360deg)' })
    fireEvent.click(screen.getByRole('button', { name: '下一张' }))
    expect(container.querySelector('blockquote')!.textContent).toBe(first)
    act(() => vi.advanceTimersByTime(419))
    expect(container.querySelector('blockquote')!.textContent).toBe(first)
    act(() => vi.advanceTimersByTime(1))
    expect(container.querySelector('.truth-card')).toHaveStyle({ transform: 'rotateY(540deg)' })
    expect(container.querySelector('blockquote')!.textContent).not.toBe(first)
    expect(screen.getByText('第 1 轮 · 已翻开 2 / 150 张')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(430))
    expect(screen.getByRole('button', { name: '下一张' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '这题先跳过' }))
    expect(container.querySelector('.truth-card')).toHaveStyle({ transform: 'rotateY(720deg)' })
    act(() => vi.advanceTimersByTime(850))
    expect(container.querySelector('.truth-card')).toHaveStyle({ transform: 'rotateY(900deg)' })
    expect(screen.getByText('第 1 轮 · 已翻开 3 / 150 张')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一张' }))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
