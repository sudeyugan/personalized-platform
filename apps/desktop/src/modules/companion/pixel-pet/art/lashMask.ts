/** Include the warm/dark upper-lash pixels, including detached antialias tips.
 * The bounded envelope excludes eyebrows; cool hair outlines are not lashes.
 */
export function includeUpperLashes(original: Uint8ClampedArray, affected: Uint8Array, width: number,
  cx: number, cy: number, rx: number, ry: number, cosine: number, sine: number) {
  for (let i = 0; i < affected.length; i++) {
    const dx = i % width - cx, dy = Math.floor(i / width) - cy
    const u = dx * cosine + dy * sine, v = -dx * sine + dy * cosine
    const p = i * 4, r = original[p], g = original[p + 1], b = original[p + 2]
    const lash = original[p + 3] > 100 && Math.abs(u) < rx * 1.95 && v > -ry * 2.15 && v < ry * .15
      && r < 205 && g < 170 && b < 195 && (r + g + b < 320 || (r > g * 1.02 && r >= b * .9))
    // Antialiased lash tips may be disconnected by a light pixel; include those
    // in the eye-level band as well, without reaching the separate brow above.
    if (lash) affected[i] = 1
  }
}
