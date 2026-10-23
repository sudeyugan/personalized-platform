export type PetAction = 'idle' | 'lift' | 'land' | 'sit' | 'stand' | 'edge'
export interface MotionTransform { x: number; y: number; angle: number; scaleX: number; scaleY: number }
export function petTransform(time: number, action: PetAction, started: number, active: boolean, seated: boolean, edge: string): MotionTransform {
  const still = { x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1 }
  if (!active) return still
  const elapsed = Math.max(0, time - started)
  const breathe = Math.sin(time / 1250) * .0025
  let angle = edge === 'left-edge' ? -.022 : edge === 'right-edge' ? .022 : 0
  // A short, infrequent weight shift rather than moving the entire window across other apps.
  const idle = time % 19000
  if (action !== 'lift' && idle > 17400 && idle < 18600) angle += Math.sin((idle - 17400) / 1200 * Math.PI * 2) * .018
  if (action === 'lift') return { ...still, y: -3, angle: Math.sin(elapsed / 260) * .035, scaleY: 1.008 }
  const settling = ['land', 'sit', 'stand', 'edge'].includes(action) && elapsed < 650
  const spring = settling ? Math.sin(elapsed / 650 * Math.PI * 3) * Math.exp(-elapsed / 175) : 0
  return { x: 0, y: 0, angle: angle + spring * .025, scaleX: 1 + spring * .012, scaleY: 1 + breathe - spring * (seated ? .014 : .023) }
}
