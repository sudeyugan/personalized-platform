import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TruthView } from './TruthView'

describe('TruthView', () => {
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
})
