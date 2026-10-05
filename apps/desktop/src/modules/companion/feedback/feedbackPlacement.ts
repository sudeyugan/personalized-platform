export interface ScreenRect { x: number; y: number; width: number; height: number }
export function feedbackPlacement(pet: ScreenRect, area: ScreenRect, size: { width: number; height: number }, gap: number) {
  const left = pet.x - size.width - gap
  const right = pet.x + pet.width + gap
  const targetX = left >= area.x ? left : right + size.width <= area.x + area.width ? right : pet.x + (pet.width - size.width) / 2
  const targetY = left >= area.x || right + size.width <= area.x + area.width
    ? pet.y + Math.min(56, pet.height / 4) : pet.y - size.height - gap
  return {
    x: Math.round(Math.max(area.x, Math.min(area.x + Math.max(0, area.width - size.width), targetX))),
    y: Math.round(Math.max(area.y, Math.min(area.y + Math.max(0, area.height - size.height), targetY))),
  }
}
