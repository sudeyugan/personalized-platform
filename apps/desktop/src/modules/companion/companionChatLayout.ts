import { PhysicalSize, PhysicalPosition } from '@tauri-apps/api/dpi'
import { availableMonitors, type Monitor, type Window as TauriWindow } from '@tauri-apps/api/window'
import type { ChatCharacter, ChatPresentation } from './chatPresentation'
import { chatPlacement } from './chatPlacement'

function nearestMonitor(monitors: Monitor[], x: number, y: number) {
  return monitors.reduce<Monitor | undefined>((nearest, monitor) => {
    if (!nearest) return monitor
    const distance = (candidate: Monitor) => {
      const area = candidate.workArea
      return Math.hypot(Math.max(area.position.x - x, 0, x - area.position.x - area.size.width), Math.max(area.position.y - y, 0, y - area.position.y - area.size.height))
    }
    return distance(monitor) < distance(nearest) ? monitor : nearest
  }, undefined)
}

let pendingLayout = Promise.resolve()
export function positionCompanionChat(portrait: TauriWindow, chat: TauriWindow, mode: ChatPresentation = 'full', character: ChatCharacter = 'pet') {
  const next = pendingLayout.catch(() => undefined).then(() => applyChatLayout(portrait, chat, mode, character))
  pendingLayout = next
  return next
}

async function applyChatLayout(portrait: TauriWindow, chat: TauriWindow, mode: ChatPresentation, character: ChatCharacter) {
  const [position, size, monitors] = await Promise.all([portrait.outerPosition(), portrait.outerSize(), availableMonitors()])
  const monitor = nearestMonitor(monitors, position.x + size.width / 2, position.y + size.height / 2)
  if (!monitor) return
  const area = monitor.workArea
  const next = chatPlacement({ ...position, ...size }, { ...area.position, ...area.size }, monitor.scaleFactor, mode, character)
  // Physical sizing uses the target monitor, even before the native window crosses screens.
  await chat.setSize(new PhysicalSize(next.width, next.height))
  await chat.setPosition(new PhysicalPosition(next.x, next.y))
}
