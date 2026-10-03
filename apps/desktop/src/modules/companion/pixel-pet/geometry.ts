import { PIXEL_PET_SIZE, type PixelPoint } from './types'

export interface PixelMonitor {
  workArea: { position: PixelPoint; size: { width: number; height: number } }
  scaleFactor: number
}
export interface WindowGeometry { position: PixelPoint; size: { width: number; height: number } }

export function nearestPixelMonitor(monitors: PixelMonitor[], geometry: WindowGeometry) {
  const center = { x: geometry.position.x + geometry.size.width / 2, y: geometry.position.y + geometry.size.height / 2 }
  return monitors.reduce<PixelMonitor | undefined>((best, candidate) => {
    const distance = (monitor: PixelMonitor) => Math.hypot(
      center.x - monitor.workArea.position.x - monitor.workArea.size.width / 2,
      center.y - monitor.workArea.position.y - monitor.workArea.size.height / 2,
    )
    return !best || distance(candidate) < distance(best) ? candidate : best
  }, undefined)
}

export function rightEdgeGeometry(monitor: PixelMonitor) {
  const { position, size } = monitor.workArea
  const factor = monitor.scaleFactor > 0 ? monitor.scaleFactor : 1
  // Integral *physical* pixels, even at Windows 125% / 150% scaling.
  const scale = Math.max(1, Math.min(Math.round(2 * factor), Math.floor(size.width / PIXEL_PET_SIZE.width), Math.floor(size.height / PIXEL_PET_SIZE.height)))
  const width = PIXEL_PET_SIZE.width * scale
  const height = PIXEL_PET_SIZE.height * scale
  return { scale, position: { x: position.x + size.width - width, y: position.y + Math.round((size.height - height) * 0.45) }, size: { width, height } }
}

export function screenToPixel(cursor: PixelPoint, origin: PixelPoint, factor: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): PixelPoint | null {
  if (!(factor > 0 && rect.width > 0 && rect.height > 0)) return null
  return {
    x: ((cursor.x - origin.x) / factor - rect.left) / rect.width * PIXEL_PET_SIZE.width,
    y: ((cursor.y - origin.y) / factor - rect.top) / rect.height * PIXEL_PET_SIZE.height,
  }
}
