import { chatDimensions, type ChatCharacter, type ChatPresentation } from './chatPresentation'

type Rect = { x: number; y: number; width: number; height: number }
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
export function chatPlacement(pet: Rect, area: Rect, scale: number, mode: ChatPresentation, character: ChatCharacter) {
  const logical = chatDimensions(mode, character), gap = Math.round(12 * scale)
  const width = Math.min(Math.round(logical.width * scale), area.width)
  const height = Math.min(Math.round(logical.height * scale), area.height)
  const y = pet.y + (mode === 'full' ? 0 : Math.round(pet.height * (character === 'pet' ? .08 : .18)))
  const center = pet.x + (pet.width - width) / 2
  const sides = [{ x: pet.x - width - gap, y }, { x: pet.x + pet.width + gap, y }]
  const above = { x: center, y: pet.y - height - gap }, below = { x: center, y: pet.y + pet.height + gap }
  const bottom = pet.y + pet.height >= area.y + area.height - 32 * scale
  const candidates = (bottom ? [above, ...sides, below] : [...sides, above, below]).map(point => ({
    x: clamp(point.x, area.x, area.x + area.width - width),
    y: clamp(point.y, area.y, area.y + area.height - height),
  }))
  const overlap = (point: { x: number; y: number }) => Math.max(0, Math.min(point.x + width, pet.x + pet.width) - Math.max(point.x, pet.x))
    * Math.max(0, Math.min(point.y + height, pet.y + pet.height) - Math.max(point.y, pet.y))
  const best = candidates.reduce((a, b) => overlap(b) < overlap(a) ? b : a)
  return { ...best, width, height }
}
