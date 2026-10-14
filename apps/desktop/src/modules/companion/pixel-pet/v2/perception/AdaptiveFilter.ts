// Independent implementation of the 1-Euro equations (Casiez et al., CHI 2012):
// https://gery.casiez.net/1euro/ . Faster movement raises cutoff, not jitter gain.
export function createAdaptiveFilter(minCutoff = 1.35, beta = .65) {
  let previous: number | undefined, filtered = 0, derivative = 0, time = 0
  const gain = (dt: number, cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))
  return {
    update(value: number, now: number) {
      if (!Number.isFinite(value) || !Number.isFinite(now)) return filtered
      if (previous === undefined || now - time > 1000) {
        previous = filtered = value; derivative = 0; time = now; return value
      }
      if (now <= time) return filtered
      const dt = Math.min(.3, (now - time) / 1000)
      derivative += ((value - previous) / dt - derivative) * gain(dt, 1)
      filtered += (value - filtered) * gain(dt, minCutoff + beta * Math.abs(derivative))
      previous = value; time = now
      return filtered
    },
    reset() { previous = undefined; filtered = derivative = time = 0 },
  }
}
