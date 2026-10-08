import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ConversationHistory } from './ConversationHistory'
it('follows streaming only at the bottom, preserving the reader position otherwise', () => {
  const messages = [{ id: 'one', role: 'companion' as const, content: '全文保持完整', createdAt: '' }]
  const { container, rerender } = render(<ConversationHistory messages={messages} stream="" note="" />)
  const viewport = container.querySelector('.desktop-chat-messages') as HTMLDivElement
  Object.defineProperties(viewport, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { value: 100 } })
  rerender(<ConversationHistory messages={messages} stream="正在生成" note="" />)
  expect(viewport.scrollTop).toBe(1000)
  viewport.scrollTop = 40; fireEvent.scroll(viewport)
  rerender(<ConversationHistory messages={messages} stream="正在生成更多内容" note="" />)
  expect(viewport.scrollTop).toBe(40)
  fireEvent.click(screen.getByRole('button', { name: /回到最新回复/ }))
  expect(viewport.scrollTop).toBe(1000)
  expect(screen.getByText('全文保持完整')).toBeInTheDocument()
})
