import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi'
import { availableMonitors, type Monitor, type Window as TauriWindow } from '@tauri-apps/api/window'
import { chatDimensions, type ChatPresentation } from './chatPresentation'

function nearestMonitor(monitors: Monitor[], x: number, y: number) {
  return monitors.reduce<Monitor | undefined>((nearest, monitor) => {
    if (!nearest) return monitor
    const distance = (candidate: Monitor) => {
      const area = candidate.workArea
      return Math.hypot(x - (area.position.x + area.size.width / 2), y - (area.position.y + area.size.height / 2))
    }
    return distance(monitor) < distance(nearest) ? monitor : nearest
  }, undefined)
}

let pendingLayout = Promise.resolve()
export function positionCompanionChat(portrait: TauriWindow, chat: TauriWindow, mode: ChatPresentation = 'full') {
  const next = pendingLayout.catch(() => undefined).then(() => applyChatLayout(portrait, chat, mode))
  pendingLayout = next
  return next
}

async function applyChatLayout(portrait: TauriWindow, chat: TauriWindow, mode: ChatPresentation) {
  const { width: chatWindowWidth, height: chatWindowHeight } = chatDimensions(mode)
  await chat.setSize(new LogicalSize(chatWindowWidth, chatWindowHeight))
  const [position, size, monitors] = await Promise.all([portrait.outerPosition(), portrait.outerSize(), availableMonitors()])
  const monitor = nearestMonitor(monitors, position.x + size.width / 2, position.y + size.height / 2)
  if (!monitor) return
  const area = monitor.workArea
  const chatWidth = Math.round(chatWindowWidth * monitor.scaleFactor)
  const chatHeight = Math.round(chatWindowHeight * monitor.scaleFactor)
  const opensLeft = position.x - chatWidth >= area.position.x
  const bottom = position.y + size.height >= area.position.y + area.size.height - 32 * monitor.scaleFactor
  const desiredX = bottom ? position.x + (size.width - chatWidth) / 2 : opensLeft ? position.x - chatWidth : position.x + size.width
  const maxX = Math.max(area.position.x, area.position.x + area.size.width - chatWidth)
  const maxY = Math.max(area.position.y, area.position.y + area.size.height - chatHeight)
  await chat.setPosition(new PhysicalPosition(
    Math.min(maxX, Math.max(area.position.x, desiredX)),
    Math.min(maxY, Math.max(area.position.y, bottom ? position.y - chatHeight : position.y)),
  ))
}
