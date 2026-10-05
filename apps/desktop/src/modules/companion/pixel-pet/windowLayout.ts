import type { PixelPetPose } from './types'
import type { CompanionPetSide } from '../../../domain/models'
import { LogicalSize, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { availableMonitors, getCurrentWindow } from '@tauri-apps/api/window'
import { edgeGeometry, nearestPixelMonitor, type PixelMonitor, type WindowGeometry } from './geometry'
import { placementPose, clampGeometry, createPlacementStore, dockGeometry, restorePlacement, savedMonitor, snapPlacement, type PlacementMode, type PlacementStorage } from './placement'

type PetWindow = Pick<ReturnType<typeof getCurrentWindow>, 'outerPosition' | 'outerSize' | 'scaleFactor' | 'setMinSize' | 'setSize' | 'setPosition'>
export interface PixelLayout { scale: number; pixelRatio: number; ready: boolean; side?: CompanionPetSide; pose?: PixelPetPose }
const inactive: PixelLayout = { scale: 1, pixelRatio: 1, ready: false }
export function createPixelWindowLayout(appWindow: PetWindow, monitors: () => Promise<PixelMonitor[]> = availableMonitors, storage?: PlacementStorage | null) {
  const placements = createPlacementStore(storage)
  let mode: PlacementMode | undefined, currentSide: CompanionPetSide = 'right-edge'
  let queue: Promise<PixelLayout> = Promise.resolve(inactive)
  const serial = (operation: () => Promise<PixelLayout>) => { queue = queue.catch(() => inactive).then(operation); return queue }
  const geometry = async () => {
    const [position, size] = await Promise.all([appWindow.outerPosition(), appWindow.outerSize()])
    return { position, size }
  }
  const move = async (next: WindowGeometry, pixel: boolean) => {
    await appWindow.setMinSize(pixel ? new PhysicalSize(192, 240) : new LogicalSize(220, 420))
    await appWindow.setSize(new PhysicalSize(next.size.width, next.size.height))
    await appWindow.setPosition(new PhysicalPosition(next.position.x, next.position.y))
  }
  const layout = async (scale = 1): Promise<PixelLayout> => {
    const current = await geometry(), monitor = nearestPixelMonitor(await monitors(), current)
    return { scale, pixelRatio: await appWindow.scaleFactor(), ready: mode === 'pixel',
      side: mode === 'pixel' ? currentSide : undefined,
      pose: mode === 'pixel' && monitor ? placementPose(current, monitor, currentSide) : undefined }
  }
  const save = (kind: PlacementMode, value: WindowGeometry, monitor: PixelMonitor) => placements.save(kind, { geometry: value, monitor, ...(kind === 'pixel' ? { side: currentSide } : {}) })
  return {
    apply(enabled: boolean, side: CompanionPetSide = 'right-edge', forceDock = false): Promise<PixelLayout> {
      return serial(async () => {
        const current = await geometry(), all = await monitors(), currentMonitor = nearestPixelMonitor(all, current)
        if (!currentMonitor) throw new Error('未找到可用显示器')
        if (!enabled) {
          if (mode === 'pixel') save('pixel', current, currentMonitor)
          const saved = placements.get('webm')
          if (saved && mode !== 'webm') {
            const monitor = savedMonitor(saved, all) ?? currentMonitor
            const factor = monitor.scaleFactor / saved.monitor.scaleFactor
            const size = { width: Math.max(220 * monitor.scaleFactor, Math.round(saved.geometry.size.width * factor)), height: Math.max(420 * monitor.scaleFactor, Math.round(saved.geometry.size.height * factor)) }
            // Preserve exact existing geometry when DPI has not changed.
            const exact = monitor.scaleFactor === saved.monitor.scaleFactor ? saved.geometry.size : size
            const restored = restorePlacement(saved, monitor, exact)
            await move(restored, false); save('webm', restored, monitor)
          } else save('webm', clampGeometry(current, currentMonitor), currentMonitor)
          mode = 'webm'
          return inactive
        }
        if (mode !== 'pixel' && (mode === 'webm' || !placements.get('webm'))) save('webm', current, currentMonitor)
        const saved = placements.get('pixel')
        const monitor = mode !== 'pixel' && saved?.side === side ? savedMonitor(saved, all) ?? currentMonitor : currentMonitor
        const dock = dockGeometry(monitor, side, mode === 'pixel' ? current : undefined)
        const restored = mode !== 'pixel' && saved?.side === side && !forceDock ? restorePlacement(saved, monitor, dock.size) : dock
        if (mode === 'pixel' && currentSide === side && !forceDock) return layout(edgeGeometry(monitor).scale)
        await move(restored, true)
        mode = 'pixel'; currentSide = side; save('pixel', restored, monitor)
        return layout(dock.scale)
      })
    },
    float(): Promise<PixelLayout> {
      return serial(async () => {
        if (mode !== 'pixel') return inactive
        const current = await geometry(), monitor = nearestPixelMonitor(await monitors(), current)
        if (!monitor) throw new Error('未找到可用显示器')
        const area = monitor.workArea, scale = edgeGeometry(monitor).scale
        const size = { width: 192 * scale, height: 240 * scale }
        const next = clampGeometry({ size, position: { x: area.position.x + Math.round((area.size.width - size.width) / 2), y: area.position.y + Math.round((area.size.height - size.height) / 2) } }, monitor)
        await move(next, true); save('pixel', next, monitor)
        return layout(scale)
      })
    },
    settle(snap = false): Promise<PixelLayout> {
      return serial(async () => {
        if (!mode) return inactive
        const current = await geometry(), all = await monitors(), monitor = nearestPixelMonitor(all, current)
        if (!monitor) throw new Error('未找到可用显示器')
        if (mode === 'webm') {
          const next = clampGeometry(current, monitor)
          if (next.position.x !== current.position.x || next.position.y !== current.position.y) await appWindow.setPosition(new PhysicalPosition(next.position.x, next.position.y))
          save('webm', next, monitor)
          return inactive
        }
        const scale = edgeGeometry(monitor).scale
        const resized = { ...current, size: { width: 192 * scale, height: 240 * scale } }
        const next = snap ? snapPlacement(resized, monitor, currentSide) : { geometry: clampGeometry(resized, monitor), side: currentSide }
        if (snap || next.geometry.position.x !== current.position.x || next.geometry.position.y !== current.position.y || current.size.width !== resized.size.width || current.size.height !== resized.size.height) await move(next.geometry, true)
        currentSide = next.side
        save('pixel', next.geometry, monitor)
        return layout(scale)
      })
    },
  }
}
