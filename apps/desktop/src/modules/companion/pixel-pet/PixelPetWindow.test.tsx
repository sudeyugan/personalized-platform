import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyCompanionDesktopSnapshot } from '../companionDesktop'
import { PixelPetWindow } from './PixelPetWindow'

const native = vi.hoisted(() => ({
  emit: vi.fn().mockResolvedValue(undefined), down: vi.fn(),
  ignore: vi.fn().mockResolvedValue(undefined), top: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ setIgnoreCursorEvents: native.ignore, setAlwaysOnTop: native.top }) }))
vi.mock('@tauri-apps/api/event', () => ({ emitTo: native.emit }))
vi.mock('./usePixelPetPointer', () => ({ usePixelPetPointer: () => ({ pointer: { current: null }, error: '' }) }))
vi.mock('./usePixelPetInteraction', () => ({ usePixelPetInteraction: () => ({ error: '', onPointerDown: native.down }) }))
vi.mock('./PixelPetRenderer', () => ({ PixelPetRenderer: ({ pose }: { pose: string }) => <div data-testid="pet-pose">{pose}</div> }))
const snapshot = { ...emptyCompanionDesktopSnapshot, pixelPetEnabled: true, desktopVisible: true, desktopMode: 'interactive' as const }
const layout = { scale: 1, pixelRatio: 1, ready: true, side: 'right-edge' as const, pose: 'float' as const }
describe('pet window menu integration', () => {
  it('dismisses menu on pet click without beginning a drag or chat gesture', () => {
    native.down.mockClear()
    render(<PixelPetWindow snapshot={snapshot} layout={layout} />)
    const interaction = screen.getByRole('button', { name: /拖动移动/ })
    fireEvent.contextMenu(interaction, { clientX: 100, clientY: 200 })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.pointerDown(interaction)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(native.down).not.toHaveBeenCalled()
    fireEvent.pointerDown(interaction)
    expect(native.down).toHaveBeenCalledTimes(1)
  })
  it('requests local pose choice and bounded main settings without chat events', () => {
    native.emit.mockClear()
    const onPose = vi.fn().mockResolvedValue(undefined)
    render(<PixelPetWindow snapshot={snapshot} layout={layout} onPose={onPose} />)
    const interaction = screen.getByRole('button', { name: /拖动移动/ })
    fireEvent.contextMenu(interaction)
    fireEvent.click(screen.getByRole('menuitem', { name: /摆放姿态/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '底部趴边' }))
    expect(onPose).toHaveBeenCalledWith('bottom-edge')
    fireEvent.contextMenu(interaction)
    fireEvent.click(screen.getByRole('menuitem', { name: '打开设置' }))
    expect(native.emit).toHaveBeenCalledExactlyOnceWith('main', 'companion:pet-menu-action', { kind: 'settings' })
  })
})
