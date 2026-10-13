// Analytic critically damped spring: stable after dropped frames/visibility gaps.
export function createSpring(initial = 0, frequency = 12) {
  let value=initial, velocity=0
  return {
    step(target: number, elapsed: number) {
      const dt=Math.max(0,Math.min(.1,Number.isFinite(elapsed)?elapsed:0))
      const next=Number.isFinite(target)?target:0, offset=value-next
      const decay=Math.exp(-frequency*dt), momentum=velocity+frequency*offset
      value=next+(offset+momentum*dt)*decay
      velocity=(velocity-frequency*momentum*dt)*decay
      return value
    },
    reset(next=initial) { value=next; velocity=0 },
  }
}
