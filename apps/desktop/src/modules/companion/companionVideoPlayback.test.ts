import { describe, expect, it } from 'vitest'
import { companionVideoStates, type CompanionVisual } from '../../domain/models'
import { availableIdleInterludes, isSustainedVideoState, isTransientVideoState, nextIdleInterludeDelay } from './companionVideoPlayback'

describe('companion WebM playback policy', () => {
  it('uses the twelve configured action categories', () => {
    expect(companionVideoStates).toEqual(['celebrating', 'concerned', 'greeting', 'idle', 'listening', 'looking', 'nodding', 'shy', 'sleepy', 'speaking', 'stretching', 'yawning'])
  })

  it('keeps only true interaction states sustained and plays looking once', () => {
    expect(isSustainedVideoState('speaking')).toBe(true)
    expect(isTransientVideoState('looking')).toBe(true)
    expect(isTransientVideoState('nodding')).toBe(true)
    expect(isTransientVideoState('celebrating')).toBe(true)
  })

  it('keeps daytime interludes neutral and admits night actions at low frequency', () => {
    const visual: CompanionVisual = { type: 'video', videos: {}, clips: { looking: ['look'], stretching: ['stretch'], yawning: ['yawn'], sleepy: ['sleep'], concerned: ['concern'] } }
    expect(availableIdleInterludes(visual, new Date('2026-09-25T12:00:00'), () => 0)).toEqual(['looking', 'stretching'])
    expect(availableIdleInterludes(visual, new Date('2026-09-25T23:00:00'), () => 0)).toEqual(['looking', 'stretching', 'yawning'])
    expect(availableIdleInterludes(visual, new Date('2026-09-25T02:00:00'), () => 0)).toEqual(['looking', 'stretching', 'yawning', 'sleepy'])
  })

  it('leaves twenty to forty-five seconds of idle between interludes', () => {
    expect(nextIdleInterludeDelay(() => 0)).toBe(20_000)
    expect(nextIdleInterludeDelay(() => 1)).toBe(45_000)
  })
})
