import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { describe, expect, it, vi } from 'vitest'
import { createPixelWindowLayout } from './windowLayout'
import type { CompanionPetSide } from '../../../domain/models'
import type { PixelMonitor } from './geometry'

function fixture() {
  const entries = new Map<string, string>()
  const storage = { getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, v: string) => { entries.set(k, v) } }
  let position = { x: 300, y: 100 }, size = { width: 300, height: 520 }
  let currentMonitor: PixelMonitor = { scaleFactor: 1, workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } } }
  const appWindow = {
    outerPosition: vi.fn(async () => new PhysicalPosition(position.x, position.y)), outerSize: vi.fn(async () => new PhysicalSize(size.width, size.height)),
    scaleFactor: vi.fn(async () => currentMonitor.scaleFactor), setMinSize: vi.fn(async () => undefined),
    setSize: vi.fn(async (next: typeof size) => { size = { width: next.width, height: next.height } }),
    setPosition: vi.fn(async (next: typeof position) => { position = { x: next.x, y: next.y } }),
  }
  const monitors = async () => [currentMonitor]
  return { appWindow, restart: () => createPixelWindowLayout(appWindow as unknown as Parameters<typeof createPixelWindowLayout>[0], monitors, storage),
    position: () => position, size: () => size,
    drag: (x: number, y: number) => { position = { x, y } },
    monitor: (next: PixelMonitor) => { currentMonitor = next },
  }
}
describe('separate persisted native window placements', () => {
  it('natural placement and explicit docking work even when the chosen edge is unchanged', async () => {
    const f = fixture(), controller = f.restart()
    await controller.apply(true)
    expect(await controller.float()).toMatchObject({ pose: 'float', side: 'right-edge' })
    expect(f.position()).toEqual({ x: 864, y: 400 })
    expect(await controller.apply(true, 'right-edge', true)).toMatchObject({ pose: 'right-edge' })
    expect(f.position()).toEqual({ x: 1728, y: 400 })
  })

  it('remembers freely placed Pixel and WebM positions across toggles and restarts', async () => {
    const f = fixture(), controller = f.restart()
    await controller.apply(false)
    await controller.apply(true)
    f.drag(700, 400); expect(await controller.settle(true)).toMatchObject({ pose: 'float', side: 'right-edge' })
    await controller.apply(false)
    expect(f.position()).toEqual({ x: 300, y: 100 }); expect(f.size()).toEqual({ width: 300, height: 520 })
    f.drag(100, 200); await controller.settle()
    await controller.apply(true)
    expect(f.position()).toEqual({ x: 700, y: 400 })
    f.drag(800, 500); await controller.settle()
    const restarted = f.restart()
    expect(await restarted.apply(true)).toMatchObject({ pose: 'float' })
    expect(f.position()).toEqual({ x: 800, y: 500 })
    await restarted.apply(false)
    expect(f.position()).toEqual({ x: 100, y: 200 })
  })
  it('snaps bottom, synchronizes the pose without re-docking, and remembers that pose', async () => {
    const f = fixture(), controller = f.restart()
    await controller.apply(true)
    f.drag(650, 790)
    expect(await controller.settle(true)).toMatchObject({ side: 'bottom-edge', ready: true })
    expect(f.position()).toEqual({ x: 650, y: 800 })
    {
      f.appWindow.setPosition.mockClear()
      await controller.apply(true, 'bottom-edge')
      expect(f.appWindow.setPosition).not.toHaveBeenCalled()
    }
    await controller.apply(false)
    await f.restart().apply(true, 'bottom-edge')
    expect(f.position()).toEqual({ x: 650, y: 800 })
  })
  it.each(['left-edge', 'bottom-edge'] as CompanionPetSide[])('preserves the perpendicular axis when explicitly choosing %s', async side => {
    const f = fixture(), controller = f.restart()
    await controller.apply(true); f.drag(600, 400)
    await controller.apply(true, side)
    expect(f.position()).toEqual(side === 'bottom-edge' ? { x: 600, y: 800 } : { x: 0, y: 400 })
  })
  it('re-scales and clamps the placement onto the remaining monitor after a DPI change', async () => {
    const f = fixture(), controller = f.restart()
    await controller.apply(true); f.drag(1728, 800); await controller.settle()
    f.monitor({ scaleFactor: 2, workArea: { position: { x: -2560, y: 0 }, size: { width: 2560, height: 1400 } } })
    expect(await f.restart().apply(true)).toMatchObject({ scale: 2, pixelRatio: 2 })
    expect(f.position()).toEqual({ x: -384, y: 920 })
    expect(f.size()).toEqual({ width: 384, height: 480 })
  })
})
