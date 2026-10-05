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
    await waitFor(() => expect(native.callbacks.size).toBe(3))
    sendSnapshot(true)
    unmount()
    expect(native.callbacks.size).toBe(0)
    expect(native.apply).toHaveBeenLastCalledWith(false)
  })
})
