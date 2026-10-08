import { describe, expect, it } from 'vitest'
import { createHeartNotice, heartMarkerPoint, HEART_NOTICE_COOLDOWN } from './heartNotice'

describe('ephemeral heart-rate attention, not emotion inference', () => {
  const warm = (notice: ReturnType<typeof createHeartNotice>, bpm = 70, offset = 0) => {
    for (let at = offset; at <= offset + 9000; at += 1000) expect(notice.update(at, { bpm, at }, false)).toBe(0)
  }
  const sustain = (notice: ReturnType<typeof createHeartNotice>, bpm: number, offset = 10_000, blocked = false) => {
    for (let at = offset; at <= offset + 12_000; at += 1000) notice.update(at, { bpm, at }, blocked)
  }
  it('requires a warmed baseline, a sustained meaningful change and returns to neutral', () => {
    const notice = createHeartNotice(); warm(notice); sustain(notice, 95)
    expect(notice.isLooking(22_000)).toBe(true)
    expect(notice.update(22_500, { bpm: 95, at: 22_000 }, false)).toBe(1)
    expect(notice.update(23_600, { bpm: 95, at: 23_000 }, false)).toBeGreaterThan(0)
    expect(notice.update(24_000, { bpm: 95, at: 24_000 }, false)).toBe(0)
    expect(notice.isLooking(24_000)).toBe(false)
  })
  it('ignores small fluctuations, isolated spikes and alternating directions', () => {
    const notice = createHeartNotice(); warm(notice)
    for (let at = 10_000; at <= 35_000; at += 1000) expect(notice.update(at, { bpm: at % 3000 ? 71 : 95, at }, false)).toBe(0)
    for (let at = 36_000; at <= 65_000; at += 1000) expect(notice.update(at, { bpm: at % 2000 ? 110 : 45, at }, false)).toBe(0)
  })
  it('also notices a sustained decrease and debounces high-baseline small relative changes', () => {
    const notice = createHeartNotice(); warm(notice, 100); sustain(notice, 70)
    expect(notice.isLooking(22_000)).toBe(true)
    const high = createHeartNotice(); warm(high, 150); sustain(high, 164)
    expect(high.isLooking(22_000)).toBe(false)
  })
  it('cancels for interaction and never queues a missed reaction', () => {
    const notice = createHeartNotice(); warm(notice); sustain(notice, 95)
    expect(notice.update(22_500, { bpm: 95, at: 22_000 }, true)).toBe(0)
    expect(notice.isLooking(22_500)).toBe(false)
    for (let at = 23_000; at <= 50_000; at += 1000) expect(notice.update(at, { bpm: 95, at }, false)).toBe(0)
    const blocked = createHeartNotice(); warm(blocked); sustain(blocked, 95, 10_000, true)
    for (let at = 23_000; at <= 45_000; at += 1000) expect(blocked.update(at, { bpm: 95, at }, false)).toBe(0)
  })
  it('keeps cooldown across renderer reset and does not repeat for a persistent change', () => {
    const notice = createHeartNotice(); warm(notice); sustain(notice, 95)
    notice.reset(); warm(notice, 95, 23_000); sustain(notice, 65, 33_000)
    expect(notice.isLooking(45_000)).toBe(false)
    for (let at = 46_000; at < 22_000 + HEART_NOTICE_COOLDOWN + 1000; at += 1000) expect(notice.update(at, { bpm: 65, at }, false)).toBe(0)
    sustain(notice, 95, 144_000)
    expect(notice.isLooking(156_000)).toBe(true)
  })
  it('cannot manufacture a sustained change by replaying one sample or crossing a data gap', () => {
    const notice = createHeartNotice(); warm(notice)
    for (let now = 10_000; now <= 30_000; now += 500) expect(notice.update(now, { bpm: 95, at: 10_000 }, false)).toBe(0)
    expect(notice.update(31_000, { bpm: 95, at: 31_000 }, false)).toBe(0)
    expect(notice.update(31_100, null, false)).toBe(0)
    expect(notice.update(31_200, { bpm: NaN, at: 31_200 }, false)).toBe(0)
    expect(notice.update(31_300, { bpm: 95, at: 32_000 }, false)).toBe(0)
  })
})

describe('marker-to-eye coordinates', () => {
  const canvas = { left: 100, top: 200, width: 96, height: 120 }
  it('uses actual marker position and canvas/DPI scaling', () => {
    const marker = { left: 105, top: 300, width: 20, height: 10 }
    expect(heartMarkerPoint(canvas, marker, 'right-edge')).toEqual({ x: 30, y: 210 })
    expect(heartMarkerPoint(canvas, marker, 'left-edge')).toEqual({ x: 162, y: 210 })
    expect(heartMarkerPoint(canvas, marker, 'bottom-edge')).toEqual({ x: 30, y: 210 })
  })
  it('does not gaze toward a missing or unlaid-out marker', () => {
    expect(heartMarkerPoint(canvas, { left: 0, top: 0, width: 0, height: 0 }, 'right-edge')).toBeNull()
    expect(heartMarkerPoint({ ...canvas, width: NaN }, canvas, 'right-edge')).toBeNull()
  })
})
