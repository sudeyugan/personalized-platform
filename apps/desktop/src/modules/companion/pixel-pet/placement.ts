import type { CompanionPetSide } from '../../../domain/models'
import { edgeGeometry, nearestPixelMonitor, type PixelMonitor, type WindowGeometry } from './geometry'

export interface SavedPlacement { geometry: WindowGeometry; monitor: PixelMonitor; side?: CompanionPetSide }
export type PlacementMode = 'pixel' | 'webm'
export const PLACEMENT_KEY = 'yiyu:companion-window-placements:v1'
export type PlacementStorage = Pick<Storage, 'getItem' | 'setItem'>
export function localPlacementStorage(): PlacementStorage | null {
  try { return window.localStorage } catch { return null }
}
const finite = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
export function validPlacement(value: unknown): value is SavedPlacement {
  if (!value || typeof value !== 'object') return false
  const p = value as SavedPlacement, g = p.geometry, m = p.monitor
  return Boolean(g?.position && g?.size && m?.workArea?.position && m?.workArea?.size
    && [g.position.x, g.position.y, m.workArea.position.x, m.workArea.position.y].every(v => finite(v, -1000000, 1000000))
    && [g.size.width, g.size.height, m.workArea.size.width, m.workArea.size.height].every(v => finite(v, 1, 100000))
    && finite(m.scaleFactor, .5, 8)
    && (p.side === undefined || p.side === 'left-edge' || p.side === 'right-edge' || p.side === 'bottom-edge'))
}
export function createPlacementStore(storage: PlacementStorage | null = localPlacementStorage()) {
  let memory: Partial<Record<PlacementMode, SavedPlacement>> = {}
  try {
    const data = JSON.parse(storage?.getItem(PLACEMENT_KEY) ?? 'null')
    if (data?.version === 1) for (const mode of ['pixel', 'webm'] as const) if (validPlacement(data[mode])) memory[mode] = data[mode]
  } catch { /* Corrupt/device-specific preferences must never block the app. */ }
  return {
    get: (mode: PlacementMode) => memory[mode],
    save(mode: PlacementMode, placement: SavedPlacement) {
      if (!validPlacement(placement)) return
      memory = { ...memory, [mode]: placement }
      try { storage?.setItem(PLACEMENT_KEY, JSON.stringify({ version: 1, ...memory })) } catch { /* Keep session memory if storage is unavailable/full. */ }
    },
  }
}
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(min, max), Math.max(min, v))
export function clampGeometry(geometry: WindowGeometry, monitor: PixelMonitor): WindowGeometry {
  const area = monitor.workArea
  return { size: geometry.size, position: {
    x: clamp(geometry.position.x, area.position.x, area.position.x + area.size.width - geometry.size.width),
    y: clamp(geometry.position.y, area.position.y, area.position.y + area.size.height - geometry.size.height),
  } }
}
export function savedMonitor(saved: SavedPlacement, monitors: PixelMonitor[]) {
  return monitors.find(m => m.workArea.position.x === saved.monitor.workArea.position.x && m.workArea.position.y === saved.monitor.workArea.position.y)
    ?? nearestPixelMonitor(monitors, saved.geometry)
}
export function restorePlacement(saved: SavedPlacement, monitor: PixelMonitor, size: WindowGeometry['size']) {
  const oldArea = saved.monitor.workArea, area = monitor.workArea
  const ratio = (axis: 'x' | 'y', extent: 'width' | 'height') => (saved.geometry.position[axis] - oldArea.position[axis]) / Math.max(1, oldArea.size[extent] - saved.geometry.size[extent])
  return clampGeometry({ size, position: {
    x: area.position.x + Math.round(ratio('x', 'width') * Math.max(0, area.size.width - size.width)),
    y: area.position.y + Math.round(ratio('y', 'height') * Math.max(0, area.size.height - size.height)),
  } }, monitor)
}
export function snapPlacement(geometry: WindowGeometry, monitor: PixelMonitor, side: CompanionPetSide) {
  const area = monitor.workArea, maxX = area.position.x + area.size.width - geometry.size.width, maxY = area.position.y + area.size.height - geometry.size.height
  const candidates: { side: CompanionPetSide; distance: number }[] = [
    { side: 'left-edge', distance: Math.abs(geometry.position.x - area.position.x) },
    { side: 'right-edge', distance: Math.abs(geometry.position.x - maxX) },
    { side: 'bottom-edge', distance: Math.abs(geometry.position.y - maxY) },
  ]
  candidates.sort((a, b) => a.distance - b.distance || Number(b.side === side) - Number(a.side === side))
  const closest = candidates[0], snapped = closest.distance <= 24 * monitor.scaleFactor
  const nextSide = snapped ? closest.side : side, next = clampGeometry(geometry, monitor)
  if (snapped) {
    if (nextSide === 'bottom-edge') next.position.y = Math.max(area.position.y, maxY)
    else next.position.x = nextSide === 'left-edge' ? area.position.x : Math.max(area.position.x, maxX)
  }
  return { geometry: next, side: nextSide, snapped }
}
export function dockGeometry(monitor: PixelMonitor, side: CompanionPetSide, current?: WindowGeometry) {
  const geometry = edgeGeometry(monitor, side)
  if (current) {
    if (side === 'bottom-edge') geometry.position.x = current.position.x
    else geometry.position.y = current.position.y
  }
  return { ...clampGeometry(geometry, monitor), scale: geometry.scale }
}


export function placementPose(geometry: WindowGeometry, monitor: PixelMonitor, side: CompanionPetSide): CompanionPetSide | 'float' {
  const area = monitor.workArea
  const distance = side === 'bottom-edge'
    ? Math.abs(geometry.position.y - Math.max(area.position.y, area.position.y + area.size.height - geometry.size.height))
    : Math.abs(geometry.position.x - (side === 'left-edge' ? area.position.x : Math.max(area.position.x, area.position.x + area.size.width - geometry.size.width)))
  return distance <= 2 * monitor.scaleFactor ? side : 'float'
}
