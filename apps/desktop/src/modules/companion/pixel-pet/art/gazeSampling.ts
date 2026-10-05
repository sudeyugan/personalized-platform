// Movement stays proportional to the original eye size in each approved style.
export function gazeAxisLimit(radius: number, vertical = false) {
  return radius * (vertical ? .30 : .28)
}
export function gazeDisplacement(rx: number, ry: number, x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 }
  const nx = x / 3.5, ny = y / 2, distance = Math.max(1, Math.hypot(nx, ny))
  return { x: nx / distance * gazeAxisLimit(rx), y: ny / distance * gazeAxisLimit(ry, true) }
}
