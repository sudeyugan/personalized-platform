import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useRef, useState } from 'react'
import { screenToPixel } from './geometry'
import type { PixelPoint } from './types'

export function usePixelPetPointer(active: boolean) {
  const pointer = useRef<PixelPoint | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!active) { pointer.current = null; return }
    const appWindow = getCurrentWindow()
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    let geometry: { origin: PixelPoint; factor: number } | undefined
    let geometryTime = -Infinity
    const sample = async () => {
      if (disposed) return
      try {
        if (!document.hidden) {
          if (!geometry || performance.now() - geometryTime >= 500) {
            const [origin, factor] = await Promise.all([appWindow.innerPosition(), appWindow.scaleFactor()])
            geometry = { origin, factor }; geometryTime = performance.now()
          }
          const position = await cursorPosition()
          const rect = document.querySelector<HTMLCanvasElement>('.pixel-pet-canvas')?.getBoundingClientRect()
          if (!disposed && rect) pointer.current = screenToPixel(position, geometry.origin, geometry.factor, rect)
          if (!disposed) setError('')
        }
      } catch {
        if (!disposed) { pointer.current = null; setError('屏幕视线追踪暂不可用') }
      }
      if (!disposed) timer = setTimeout(() => void sample(), 50)
    }
    void sample()
    return () => { disposed = true; clearTimeout(timer); pointer.current = null }
  }, [active])
  return { pointer, error }
}
