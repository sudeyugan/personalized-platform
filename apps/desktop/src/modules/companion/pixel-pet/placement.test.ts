import { describe, expect, it } from 'vitest'
import { clampGeometry, createPlacementStore, dockGeometry, PLACEMENT_KEY, restorePlacement, savedMonitor, snapPlacement, validPlacement, type PlacementStorage } from './placement'
const monitor = { scaleFactor: 1, workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } } }
const geometry = { position: { x: 1728, y: 400 }, size: { width: 192, height: 240 } }
const saved = { geometry, monitor, side: 'right-edge' as const }
function memoryStorage(): PlacementStorage {
  const entries = new Map<string, string>()
  return { getItem: k => entries.get(k) ?? null, setItem: (k, v) => { entries.set(k, v) } }
}
describe('device-only pet placement', () => {
  it('persists Pixel and WebM independently and restores across controller instances', () => {
    const storage = memoryStorage(), store = createPlacementStore(storage)
    store.save('pixel', saved)
    store.save('webm', { geometry: { ...geometry, position: { x: 300, y: 100 } }, monitor })
    const restored = createPlacementStore(storage)
    expect(restored.get('pixel')).toEqual(saved)
    expect(restored.get('webm')?.geometry.position.x).toBe(300)
  })
  it('rejects corrupt/schema-incompatible/unbounded data and never blocks on unavailable storage', () => {
    for (const raw of ['oops', '{"version":2}', '{"version":1,"pixel":{"geometry":{}}}']) {
      const storage = memoryStorage(); storage.setItem(PLACEMENT_KEY, raw)
      expect(createPlacementStore(storage).get('pixel')).toBeUndefined()
    }
    expect(validPlacement({ ...saved, geometry: { ...geometry, position: { x: Infinity, y: 1 } } })).toBe(false)
    expect(validPlacement({ ...saved, side: 'sleep' })).toBe(false)
    expect(validPlacement({ ...saved, monitor: { ...monitor, scaleFactor: 0 } })).toBe(false)
    const disabled = createPlacementStore({ getItem: () => { throw Error('blocked') }, setItem: () => { throw Error('full') } })
    expect(() => disabled.save('pixel', saved)).not.toThrow()
    expect(disabled.get('pixel')).toEqual(saved)
  })
  it('snaps close left/right/bottom edges and preserves the perpendicular coordinate', () => {
    expect(snapPlacement({ ...geometry, position: { x: 10, y: 400 } }, monitor, 'right-edge')).toMatchObject({ side: 'left-edge', snapped: true, geometry: { position: { x: 0, y: 400 } } })
    expect(snapPlacement({ ...geometry, position: { x: 1710, y: 400 } }, monitor, 'left-edge')).toMatchObject({ side: 'right-edge', geometry: { position: { x: 1728, y: 400 } } })
    expect(snapPlacement({ ...geometry, position: { x: 600, y: 790 } }, monitor, 'right-edge')).toMatchObject({ side: 'bottom-edge', geometry: { position: { x: 600, y: 800 } } })
    expect(snapPlacement({ ...geometry, position: { x: 600, y: 500 } }, monitor, 'bottom-edge')).toMatchObject({ side: 'bottom-edge', snapped: false, geometry: { position: { x: 600, y: 500 } } })
  })
  it('scales the snap distance with DPI and prefers the current pose at an exact corner tie', () => {
    const highDpi = { ...monitor, scaleFactor: 2 }
    expect(snapPlacement({ ...geometry, position: { x: 45, y: 400 } }, highDpi, 'right-edge').snapped).toBe(true)
    expect(snapPlacement({ ...geometry, position: { x: 45, y: 400 } }, monitor, 'right-edge').snapped).toBe(false)
    expect(snapPlacement({ ...geometry, position: { x: 1728, y: 800 } }, monitor, 'bottom-edge').side).toBe('bottom-edge')
  })
  it('restores relative free position on changed DPI/resolution and clamps disconnected negative-origin monitors', () => {
    const changed = { scaleFactor: 2, workArea: { position: { x: -2560, y: 0 }, size: { width: 2560, height: 1400 } } }
    const restored = restorePlacement(saved, changed, { width: 384, height: 480 })
    expect(restored.position).toEqual({ x: -384, y: 460 })
    expect(savedMonitor(saved, [changed])).toEqual(changed)
    expect(clampGeometry({ ...geometry, position: { x: -9000, y: 9000 } }, monitor).position).toEqual({ x: 0, y: 800 })
    expect(dockGeometry(monitor, 'bottom-edge', { ...geometry, position: { x: 600, y: 200 } }).position).toEqual({ x: 600, y: 800 })
  })
})
