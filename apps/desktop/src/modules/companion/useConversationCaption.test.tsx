import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useConversationCaption } from './useConversationCaption'
import type { ChatPresentation } from './chatPresentation'
const base = { mode: 'voice' as ChatPresentation, speech: '', speaking: false, listening: false, busy: false, stream: '尚未朗读的模型内容', messages: [{ role: 'companion', content: '上一轮回答' }], reading: false }
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
it('uses actual TTS, retains the ending briefly, then returns to idle without old history', () => {
  const { result, rerender } = renderHook(useConversationCaption, { initialProps: { ...base, speech: '此刻的句子', speaking: true } })
  expect(result.current.text).toBe('此刻的句子')
  rerender({ ...base, speech: '', speaking: false })
  expect(result.current.text).toBe('此刻的句子')
  act(() => vi.advanceTimersByTime(6001))
  expect(result.current.text).not.toContain('上一轮回答')
  expect(result.current.text).not.toContain('尚未朗读')
})
it('holds while reading or paused, and clears immediately for a new listening turn', () => {
  const { result, rerender } = renderHook(useConversationCaption, { initialProps: { ...base, speech: '还在读的句子', speaking: true } })
  act(() => vi.advanceTimersByTime(7000))
  expect(result.current.text).toBe('还在读的句子')
  rerender({ ...base, speech: '', speaking: false, reading: true })
  act(() => vi.advanceTimersByTime(7000))
  expect(result.current.text).toBe('还在读的句子')
  rerender({ ...base, listening: true })
  expect(result.current.text).toBe('我在听，你慢慢说。')
  rerender(base)
  expect(result.current.text).not.toContain('还在读')
})
it('keeps a manually opened text reply readable and avoids stale text during thinking', () => {
  const { result, rerender } = renderHook(useConversationCaption, { initialProps: { ...base, mode: 'bubble' as ChatPresentation, stream: '' } })
  act(() => vi.advanceTimersByTime(60000))
  expect(result.current.text).toBe('上一轮回答')
  rerender({ ...base, mode: 'bubble', stream: '', busy: true })
  expect(result.current.text).toBe('让我想一想…')
})
