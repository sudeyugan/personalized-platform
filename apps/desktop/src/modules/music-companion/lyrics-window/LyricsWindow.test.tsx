import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LyricsPresentation } from './LyricsWindow'
import type { LyricsTick, LyricsTrack } from './types'
const track: LyricsTrack = { key: 'song', title: '河流（Live）', artist: '川川南', lines: [{ at: 0, text: '第一句' }, { at: 1000, text: '第二句' }, { at: 2000, text: '第三句' }] }
const tick: LyricsTick = { key: 'song', position: 1000, offsetMs: 0, playing: true, status: '', reader: false, pinned: false, through: false, fontSize: 16, opacity: 92, pixel: true, busy: false, controls: false, canPlay: false, canPause: true, canPrevious: false, canNext: true }
describe('dedicated lyrics presentation', () => {
  it('shows only the current sentence and opens reading on click', () => {
    const request = vi.fn()
    const { container } = render(<LyricsPresentation track={track} tick={tick} request={request} />)
    expect(container.querySelector('main')).toHaveClass('pet', 'subtitle')
    expect(screen.getByText('第二句')).toBeInTheDocument()
    expect(screen.queryByText('第一句')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '阅读整曲歌词' }))
    expect(request).toHaveBeenCalledWith({ kind: 'view', key: 'song', reader: true })
    expect(screen.queryByRole('button', { name: '暂停QQ音乐' })).not.toBeInTheDocument()
  })
  it('pauses following on manual scroll and offers an explicit resume', () => {
    render(<LyricsPresentation track={track} tick={{ ...tick, reader: true, pixel: false }} request={vi.fn()} />)
    expect(screen.getByText('第一句')).toBeInTheDocument()
    expect(screen.getByText('第二句')).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByText('回到当前句')).not.toBeInTheDocument()
    fireEvent.wheel(screen.getByLabelText('整曲歌词'))
    fireEvent.click(screen.getByText('回到当前句'))
    expect(screen.queryByText('回到当前句')).not.toBeInTheDocument()
  })
  it('calibrates only the current song and requires explicit controls/pinning', () => {
    const request = vi.fn()
    render(<LyricsPresentation track={track} tick={{ ...tick, reader: true, pinned: true, controls: true }} request={request} />)
    fireEvent.click(screen.getByRole('button', { name: '歌词提前0.1秒' }))
    expect(request).toHaveBeenLastCalledWith({ kind: 'offset', key: 'song', deltaMs: 100 })
    fireEvent.click(screen.getByRole('button', { name: '暂停QQ音乐' }))
    expect(request).toHaveBeenLastCalledWith({ kind: 'control', key: 'song', action: 'pause' })
    fireEvent.click(screen.getByRole('button', { name: '开启歌词鼠标穿透' }))
    expect(request).toHaveBeenLastCalledWith({ kind: 'through', key: 'song', enabled: true })
  })
  it('leaves instrumental gaps empty, without invented current lines or animations', () => {
    const { rerender } = render(<LyricsPresentation track={track} tick={{ ...tick, position: 25000 }} request={vi.fn()} />)
    expect(screen.queryByText('第三句')).not.toBeInTheDocument()
    rerender(<LyricsPresentation track={track} tick={{ ...tick, position: 25000, reader: true }} request={vi.fn()} />)
    expect(screen.getByText('第三句')).not.toHaveAttribute('aria-current')
  })
})
