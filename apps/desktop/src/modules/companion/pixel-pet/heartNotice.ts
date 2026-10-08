import type { HeartRateSample } from '../../heart-rate/companionHeartRate'
import type { CompanionPetSide } from '../../../domain/models'
import { posePointer } from './pose'
import type { PixelPoint } from './types'

// Interaction tuning, not medical thresholds. All state is scalar and session-only.
export const HEART_NOTICE_WARMUP = 8000
export const HEART_NOTICE_SUSTAIN = 12_000
export const HEART_NOTICE_COOLDOWN = 120_000
const DURATION = 1800
type Rect = { left: number; top: number; width: number; height: number }
export function heartMarkerPoint(canvas: Rect, marker: Rect, side: CompanionPetSide): PixelPoint | null {
  if (![canvas.left, canvas.top, canvas.width, canvas.height, marker.left, marker.top, marker.width, marker.height].every(Number.isFinite)
    || canvas.width <= 0 || canvas.height <= 0 || marker.width <= 0 || marker.height <= 0) return null
  return posePointer({ x: (marker.left + marker.width / 2 - canvas.left) / canvas.width * 192,
    y: (marker.top + marker.height / 2 - canvas.top) / canvas.height * 240 }, side)
}

export function createHeartNotice() {
  let baseline: number | undefined, warmup = 0, lastSample = -Infinity, previous = -Infinity
  let candidate: number | undefined, direction = 0, started: number | undefined, lastNotice = -Infinity
  const reset = () => { baseline = undefined; candidate = undefined; direction = 0; started = undefined; lastSample = -Infinity; previous = -Infinity }
  const isLooking = (now: number) => started !== undefined && now >= started && now - started < DURATION
  const amount = (now: number) => {
    if (!isLooking(now)) { started = undefined; return 0 }
    const elapsed = now - started!
    const phase = elapsed < 300 ? elapsed / 300 : elapsed < 1100 ? 1 : (DURATION - elapsed) / 700
    return phase * phase * (3 - 2 * phase)
  }
  return {
    reset, isLooking,
    update(now: number, sample: HeartRateSample | null, blocked: boolean) {
      if (!Number.isFinite(now) || now < previous || !sample || !Number.isInteger(sample.bpm) || sample.bpm <= 0
        || !Number.isFinite(sample.at) || now - sample.at < 0 || now - sample.at > 3000) { reset(); return 0 }
      previous = now
      if (blocked) { started = undefined; candidate = undefined; direction = 0 }
      if (sample.at - lastSample >= 650) {
        if (sample.at - lastSample > 3000) { baseline = undefined; candidate = undefined; started = undefined }
        lastSample = sample.at
        if (baseline === undefined) { baseline = sample.bpm; warmup = sample.at }
        else if (sample.at - warmup < HEART_NOTICE_WARMUP || blocked || now - lastNotice < HEART_NOTICE_COOLDOWN) {
          baseline += (sample.bpm - baseline) * .2; candidate = undefined; direction = 0
        } else {
          const difference = sample.bpm - baseline
          if (Math.abs(difference) >= Math.max(12, baseline * .18)) {
            const nextDirection = Math.sign(difference)
            if (candidate === undefined || direction !== nextDirection) { candidate = sample.at; direction = nextDirection }
            if (sample.at - candidate >= HEART_NOTICE_SUSTAIN) {
              started = now; lastNotice = now; baseline = sample.bpm; candidate = undefined; direction = 0
            }
          } else { candidate = undefined; direction = 0; baseline += difference * .04 }
        }
      }
      return blocked ? 0 : amount(now)
    },
  }
}
