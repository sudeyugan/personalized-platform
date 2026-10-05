import type { CompanionPetSide } from '../../../domain/models'
import { PIXEL_PET_SIZE, type PixelPoint } from './types'

export interface PixelMonitor {
  workArea: { position: PixelPoint; size: { width: number; height: number } }
  scaleFactor: number
}
export interface WindowGeometry { position: PixelPoint; size: { width: number; height: number } }

export function nearestPixelMonitor(monitors: PixelMonitor[], geometry: WindowGeometry) {
  const center = { x: geometry.position.x + geometry.size.width / 2, y: geometry.position.y + geometry.size.height / 2 }
  return monitors.reduce<PixelMonitor | undefined>((best, candidate) => {
    const distance = (monitor: PixelMonitor) => {
      const area = monitor.workArea
      return Math.hypot(
        Math.max(area.position.x - center.x, 0, center.x - area.position.x - area.size.width),
        Math.max(area.position.y - center.y, 0, center.y - area.position.y - area.size.height),
      )
    }
    return !best || distance(candidate) < distance(best) ? candidate : best
  }, undefined)
}

export function edgeGeometry(monitor: PixelMonitor, side: CompanionPetSide = 'right-edge') {
  const { position, size } = monitor.workArea
  const factor = monitor.scaleFactor > 0 ? monitor.scaleFactor : 1
  // Integral *physical* pixels, even at Windows 125% / 150% scaling.
  const scale = Math.max(1, Math.min(Math.round(factor), Math.floor(size.width / PIXEL_PET_SIZE.width), Math.floor(size.height / PIXEL_PET_SIZE.height)))
  const width = PIXEL_PET_SIZE.width * scale
  const height = PIXEL_PET_SIZE.height * scale
  return { scale, position: { x: side === 'bottom-edge' ? position.x + Math.round((size.width - width) * .5) : side === 'left-edge' ? position.x : position.x + size.width - width, y: side === 'bottom-edge' ? position.y + size.height - height : position.y + Math.round((size.height - height) * 0.45) }, size: { width, height } }
}

export function screenToPixel(cursor: PixelPoint, origin: PixelPoint, factor: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): PixelPoint | null {
  if (!(factor > 0 && rect.width > 0 && rect.height > 0)) return null
  return {
    x: ((cursor.x - origin.x) / factor - rect.left) / rect.width * PIXEL_PET_SIZE.width,
    y: ((cursor.y - origin.y) / factor - rect.top) / rect.height * PIXEL_PET_SIZE.height,
  }
}

export const rightEdgeGeometry = (monitor: PixelMonitor) => edgeGeometry(monitor)
