import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanionDesktopSnapshot } from './companionDesktop'
import type { PreviewVideoRequest } from './DesktopWebMRenderer'
import { emptyCompanionDesktopSnapshot } from './companionDesktop'
import { DesktopCompanionWindow } from './DesktopCompanionWindow'

const native = vi.hoisted(() => ({
  callbacks: new Map<string, (event: { payload: unknown }) => void>(),
  apply: vi.fn().mockResolvedValue({ scale: 2, pixelRatio: 1, ready: true }),
}))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onMoved: vi.fn().mockResolvedValue(() => undefined) }) }))
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn((name: string, fn: (event: { payload: unknown }) => void) => { native.callbacks.set(name, fn); return Promise.resolve(() => native.callbacks.delete(name)) }),
}))
vi.mock('./pixel-pet/windowLayout', () => ({ createPixelWindowLayout: () => ({ apply: native.apply, settle: vi.fn().mockResolvedValue({ ready: false, scale: 1, pixelRatio: 1 }) }) }))
vi.mock('./pixel-pet/PixelPetWindow', () => ({ PixelPetWindow: () => <div>pixel renderer</div> }))
vi.mock('./DesktopWebMRenderer', () => ({ DesktopWebMRenderer: ({ snapshot, previewRequest, onPreviewEnd }: { snapshot: CompanionDesktopSnapshot; previewRequest?: PreviewVideoRequest; onPreviewEnd: (key: string) => void }) =>
  <div>original renderer {snapshot.visual.type}{previewRequest && <button onClick={() => onPreviewEnd(previewRequest.instanceKey)}>finish preview</button>}</div> }))
const sendSnapshot = (pixelPetEnabled: boolean) => act(() => native.callbacks.get('companion:snapshot')?.({ payload: { ...emptyCompanionDesktopSnapshot, pixelPetEnabled, visual: { type: 'video', videos: { idle: 'base' } } } }))

describe('desktop character renderer isolation', () => {
  beforeEach(() => { native.callbacks.clear(); native.apply.mockClear() })
  it('yields listening display to active conversations but not a completed error', async () => {
    render(<DesktopCompanionWindow />)
    await waitFor(() => expect(native.callbacks.has('companion:listening')).toBe(true))
    const snapshot = { ...emptyCompanionDesktopSnapshot, desktopVisible: true }
    const song = { title: '伴听测试歌', artist: '测试歌手', album: '', playing: true, positionMs: 1000, durationMs: 3000, canPlay: false, canPause: true, canNext: false, canPrevious: false }
    act(() => {
      native.callbacks.get('companion:snapshot')?.({ payload: snapshot })
      native.callbacks.get('companion:listening')?.({ payload: { enabled: true, controls: false, key: 'track', song, lyric: '' } })
    })
    expect(screen.getByText('伴听测试歌')).toBeInTheDocument()
    act(() => native.callbacks.get('companion:snapshot')?.({ payload: { ...snapshot, agentStatus: { phase: 'thinking' } } }))
    expect(screen.queryByText('伴听测试歌')).not.toBeInTheDocument()
    act(() => native.callbacks.get('companion:snapshot')?.({ payload: { ...snapshot, agentStatus: { phase: 'error', message: '已结束' } } }))
    expect(screen.getByText('伴听测试歌')).toBeInTheDocument()
  })
  it('shows live heart readings in quiet mode and removes them when the companion hides', async () => {
    render(<DesktopCompanionWindow />)
    await waitFor(() => expect(native.callbacks.has('companion:heart-rate')).toBe(true))
    const quiet = { ...emptyCompanionDesktopSnapshot, desktopVisible: true, desktopMode: 'quiet' as const, pixelPetEnabled: true }
    act(() => native.callbacks.get('companion:snapshot')?.({ payload: quiet }))
    act(() => native.callbacks.get('companion:heart-rate')?.({ payload: { enabled: true, phase: 'connected', bpm: 72, ageMs: 0 } }))
    await waitFor(() => expect(screen.getByRole('status', { name: '心率 72 次每分钟' })).toHaveClass('pet-heart-corner'))
    act(() => native.callbacks.get('companion:snapshot')?.({ payload: { ...quiet, pixelPetEnabled: false } }))
    expect(screen.getByRole('status', { name: '心率 72 次每分钟' })).toHaveClass('webm-heart-label')
    act(() => native.callbacks.get('companion:snapshot')?.({ payload: { ...quiet, desktopVisible: false } }))
    expect(screen.queryByRole('status', { name: '心率 72 次每分钟' })).not.toBeInTheDocument()
  })
  it('mounts only the selected renderer and retains the WebM configuration across switches', async () => {
    render(<DesktopCompanionWindow />)
    await waitFor(() => expect(native.callbacks.has('companion:snapshot')).toBe(true))
    sendSnapshot(true)
    expect(screen.getByText('pixel renderer')).toBeInTheDocument()
    expect(screen.queryByText(/original renderer/)).not.toBeInTheDocument()
    sendSnapshot(false)
    expect(screen.getByText('original renderer video')).toBeInTheDocument()
    await waitFor(() => expect(native.apply).toHaveBeenLastCalledWith(false, 'right-edge'))
  })
  it('temporarily mounts WebM for explicit preview then returns to the pixel renderer', async () => {
    render(<DesktopCompanionWindow />)
    await waitFor(() => expect(native.callbacks.has('companion:preview-video')).toBe(true))
    sendSnapshot(true)
    act(() => native.callbacks.get('companion:preview-video')?.({ payload: { assetId: 'action' } }))
    expect(screen.queryByText('pixel renderer')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'finish preview' }))
    expect(screen.getByText('pixel renderer')).toBeInTheDocument()
  })
  it('cleans up listeners and restores native window geometry on unmount', async () => {
    const { unmount } = render(<DesktopCompanionWindow />)
    await waitFor(() => expect([...native.callbacks.keys()].sort()).toEqual(['companion:heart-rate', 'companion:listening', 'companion:preview-video', 'companion:snapshot']))
    sendSnapshot(true)
    unmount()
    expect(native.callbacks.size).toBe(0)
    expect(native.apply).toHaveBeenLastCalledWith(false)
  })
})
