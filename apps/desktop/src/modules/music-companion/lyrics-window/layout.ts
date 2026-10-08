export interface Rect { x: number; y: number; width: number; height: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value))
export function lyricsPlacement(role: Rect, area: Rect, scale: number, reader: boolean, pixel: boolean, pinned?: { x: number; y: number }, fontSize = 16) {
  const width = Math.min(area.width, (reader ? 340 : pixel ? 244 : 300) * scale)
  const height = Math.min(area.height, (reader ? 440 : Math.max(96, Math.ceil(fontSize * 3.3 + 44))) * scale)
  const gap = 12 * scale
  const fit = (x: number, y: number) => ({ x: Math.round(clamp(x, area.x, area.x + area.width - width)), y: Math.round(clamp(y, area.y, area.y + area.height - height)), width: Math.round(width), height: Math.round(height) })
  if (pinned) return fit(pinned.x, pinned.y)
  const candidates = [fit(role.x - width - gap, role.y + role.height - height), fit(role.x + role.width + gap, role.y + role.height - height), fit(role.x, role.y - height - gap), fit(role.x, role.y + role.height + gap)]
  const overlap = (rect: Rect) => Math.max(0, Math.min(rect.x + rect.width, role.x + role.width) - Math.max(rect.x, role.x)) * Math.max(0, Math.min(rect.y + rect.height, role.y + role.height) - Math.max(rect.y, role.y))
  return candidates.reduce((best, candidate) => overlap(candidate) < overlap(best) ? candidate : best)
}
