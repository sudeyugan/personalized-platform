// Connected 2.5D head warp: a small perspective compression plus a central
// facial shift. It stays continuous through the neck mask; not a rotated cutout.
export function headTurnOffset(dx: number, headWeight: number, turn: number) {
  const bounded = Number.isFinite(turn) ? Math.max(-.8, Math.min(.8, turn)) : 0
  const face = Math.max(0, 1 - Math.abs(dx) / 30)
  return (bounded * 3.5 * face - dx * Math.abs(bounded) * .035) * headWeight
}
