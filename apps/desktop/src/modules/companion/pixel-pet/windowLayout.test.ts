import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { describe, expect, it, vi } from 'vitest'
import { createPixelWindowLayout } from './windowLayout'

describe('pixel pet reversible window layout', () => {
  function fixture() {
    let position = { x: 300, y: 100 }, size = { width: 270, height: 480 }
    const appWindow = {
      outerPosition: vi.fn(async () => new PhysicalPosition(position.x, position.y)),
      outerSize: vi.fn(async () => new PhysicalSize(size.width, size.height)),
      scaleFactor: vi.fn().mockResolvedValue(1.25),
      setMinSize: vi.fn().mockResolvedValue(undefined),
      setSize: vi.fn(async (next: typeof size) => { size = { width: next.width, height: next.height } }),
      setPosition: vi.fn(async (next: typeof position) => { position = { x: next.x, y: next.y } }),
    }
    const monitors = vi.fn().mockResolvedValue([{ workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } }, scaleFactor: 1.25 }])
    return { appWindow, controller: createPixelWindowLayout(appWindow as unknown as Parameters<typeof createPixelWindowLayout>[0], monitors, null) }
  }
  it('restores the original physical position and size after rapid mode switches', async () => {
    const { appWindow, controller } = fixture()
    const enter = controller.apply(true)
    const leave = controller.apply(false)
    expect(await enter).toEqual({ scale: 1, pixelRatio: 1.25, ready: true, side: 'right-edge', pose: 'right-edge' })
    expect((await leave).ready).toBe(false)
    expect(appWindow.setPosition).toHaveBeenLastCalledWith(expect.objectContaining({ x: 300, y: 100 }))
    expect(appWindow.setSize).toHaveBeenLastCalledWith(expect.objectContaining({ width: 270, height: 480 }))
    expect(appWindow.setMinSize).toHaveBeenLastCalledWith(expect.objectContaining({ width: 220, height: 420 }))
  })
  it('switches sides without replacing the original WebM restore geometry', async () => {
    const { appWindow, controller } = fixture()
    await controller.apply(true)
    appWindow.outerPosition.mockResolvedValueOnce(new PhysicalPosition(1728, 500))
    expect(await controller.apply(true, 'left-edge')).toMatchObject({ side: 'left-edge', ready: true })
    expect(appWindow.setPosition).toHaveBeenLastCalledWith(expect.objectContaining({ x: 0, y: 500 }))
    await controller.apply(false)
    expect(appWindow.setPosition).toHaveBeenLastCalledWith(expect.objectContaining({ x: 300, y: 100 }))
  })
  it('restores after a partially failed docking operation', async () => {
    const { appWindow, controller } = fixture()
    appWindow.setPosition.mockRejectedValueOnce(new Error('position failed'))
    await expect(controller.apply(true)).rejects.toThrow('position failed')
    await controller.apply(false)
    expect(appWindow.setSize).toHaveBeenLastCalledWith(expect.objectContaining({ width: 270, height: 480 }))
    expect(appWindow.setPosition).toHaveBeenLastCalledWith(expect.objectContaining({ x: 300, y: 100 }))
  })
  it('does not alter the WebM window when the experimental mode was never entered', async () => {
    const { appWindow, controller } = fixture()
    await controller.apply(false)
    expect(appWindow.setPosition).not.toHaveBeenCalled()
    expect(appWindow.setSize).not.toHaveBeenCalled()
  })
})
