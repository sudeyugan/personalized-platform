import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LyricsSettings } from './LyricsSettings'
import { useListeningStore } from './listeningStore'
vi.mock('../catalog-search/CatalogSearch', () => ({ CatalogSearch: () => null }))

beforeEach(() => {
  useListeningStore.setState({ preferences: { enabled: true, controls: false, onlineLyrics: false, lyricOffsetMs: 0 }, song: null, lines: [], lyricStatus: '' })
})
it('QQ permission is separate, never inferred from the old automatic collection setting', () => {
  render(<LyricsSettings />)
  const qq = screen.getByRole('button', { name: '优先使用QQ音乐歌词' })
  expect(qq).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(screen.getByRole('button', { name: '自动收集同步歌词' }))
  expect(qq).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByText(/u.y.qq.com/)).toHaveTextContent('c.y.qq.com')
  fireEvent.click(qq)
  expect(useListeningStore.getState().preferences.qqLyrics).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '自动收集同步歌词' }))
  expect(useListeningStore.getState().preferences.onlineLyrics).toBe(false)
})
it('explicitly authorizing QQ also enables collection, without requiring two separate steps', () => {
  render(<LyricsSettings />)
  expect(screen.getByText(/开启此项也会启用自动收集/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '优先使用QQ音乐歌词' }))
  expect(useListeningStore.getState().preferences).toMatchObject({ onlineLyrics: true, qqLyrics: true })
})
