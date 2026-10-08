import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListeningBadge } from './ListeningBadge'
const events = vi.hoisted(() => ({ callback: undefined as undefined | ((event: { payload: unknown }) => void), emit: vi.fn(), stop: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn((_event, callback) => { events.callback = callback; return Promise.resolve(events.stop) }), emitTo: events.emit.mockResolvedValue(undefined) }))
const payload = { enabled: true, controls: true, key: 'song', lyric: '当前一句', song: { title: '测试歌', artist: '歌手', album: '专辑', playing: true, positionMs: 1000, durationMs: 3000, canPause: true, canNext: true, canPlay: false, canPrevious: false } }
describe('mode-specific listening marker', () => {
  beforeEach(() => { events.callback = undefined; events.emit.mockClear() })
  it('opens the external reader explicitly without duplicate lyrics or player controls', async () => {
    render(<ListeningBadge visible pixel side="right-edge" busy={false} quiet={false} />)
    await waitFor(() => expect(events.callback).toBeTruthy())
    act(() => events.callback?.({ payload }))
    expect(screen.getByText('测试歌')).toBeInTheDocument()
    expect(screen.queryByText('当前一句')).not.toBeInTheDocument()
    expect(events.emit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '展开伴听歌词' }))
    expect(events.emit).toHaveBeenCalledExactlyOnceWith('main', 'companion:lyrics-open', { key: 'song' })
  })
  it('yields to conversation/drag and keeps quiet mode noninteractive', async () => {
    const { rerender } = render(<ListeningBadge visible pixel={false} side="float" busy={false} quiet />)
    await waitFor(() => expect(events.callback).toBeTruthy())
    act(() => events.callback?.({ payload }))
    expect(screen.getByRole('button', { name: '展开伴听歌词' })).toBeDisabled()
    rerender(<ListeningBadge visible pixel={false} side="float" busy quiet={false} />)
    expect(screen.queryByText('测试歌')).not.toBeInTheDocument()
  })
  it('updates the gaze marker and rejects stale displays', async () => {
    vi.useFakeTimers()
    try {
      const input = { playing: { current: false }, marker: { current: null as HTMLElement | null } }
      render(<ListeningBadge visible pixel side="bottom-edge" busy={false} quiet={false} input={input} />)
      await act(async () => {})
      act(() => events.callback?.({ payload }))
      expect(input.playing.current).toBe(true)
      expect(input.marker.current).toBeTruthy()
      act(() => events.callback?.({ payload: { ...payload, song: { ...payload.song, playing: false } } }))
      expect(input.playing.current).toBe(false)
      act(() => vi.advanceTimersByTime(7000))
      expect(screen.queryByText('测试歌')).not.toBeInTheDocument()
      expect(input.marker.current).toBeNull()
    } finally { vi.useRealTimers() }
  })
})
