import { LogicalSize, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { availableMonitors, getCurrentWindow } from '@tauri-apps/api/window'
import { nearestPixelMonitor, rightEdgeGeometry, type WindowGeometry } from './geometry'

type PetWindow = Pick<ReturnType<typeof getCurrentWindow>, 'outerPosition' | 'outerSize' | 'scaleFactor' | 'setMinSize' | 'setSize' | 'setPosition'>
export interface PixelLayout { scale: number; pixelRatio: number; ready: boolean }
export function createPixelWindowLayout(appWindow: PetWindow, monitors = availableMonitors) {
  let original: WindowGeometry | undefined
  let queue: Promise<PixelLayout> = Promise.resolve({ scale: 2, pixelRatio: 1, ready: false })
  return {
    apply(enabled: boolean): Promise<PixelLayout> {
      queue = queue.catch(() => ({ scale: 2, pixelRatio: 1, ready: false })).then(async () => {
        if (!enabled) {
          if (original) {
            const saved = original
            await appWindow.setMinSize(new LogicalSize(220, 420))
            await appWindow.setSize(new PhysicalSize(saved.size.width, saved.size.height))
            await appWindow.setPosition(new PhysicalPosition(saved.position.x, saved.position.y))
            original = undefined
          }
          return { scale: 2, pixelRatio: 1, ready: false }
        }
        const [position, size, all] = await Promise.all([appWindow.outerPosition(), appWindow.outerSize(), monitors()])
        const monitor = nearestPixelMonitor(all, { position, size })
        if (!monitor) throw new Error('未找到可用显示器')
        original ??= { position, size }
        const layout = rightEdgeGeometry(monitor)
        await appWindow.setMinSize(new PhysicalSize(192, 240))
        await appWindow.setSize(new PhysicalSize(layout.size.width, layout.size.height))
        await appWindow.setPosition(new PhysicalPosition(layout.position.x, layout.position.y))
        const pixelRatio = await appWindow.scaleFactor()
        return { scale: layout.scale, pixelRatio, ready: true }
      })
      return queue
    },
  }
}
