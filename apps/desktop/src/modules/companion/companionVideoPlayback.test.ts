import { describe, expect, it } from 'vitest'
import { companionVideoStates, type CompanionVisual } from '../../domain/models'
import { availableIdleInterludes, isSustainedVideoState, isTransientVideoState } from './companionVideoPlayback'

describe('companion WebM playback policy', () => {
  it('uses the twelve configured action categories', () => {
    expect(companionVideoStates).toEqual(['celebrating', 'concerned', 'greeting', 'idle', 'listening', 'looking', 'nodding', 'shy', 'sleepy', 'speaking', 'stretching', 'yawning'])
  })

  it('keeps looking sustained for model work and semantic reactions one-shot', () => {
    expect(isSustainedVideoState('looking')).toBe(true)
    expect(isTransientVideoState('nodding')).toBe(true)
    expect(isTransientVideoState('celebrating')).toBe(true)
  })

  it('only inserts neutral looking and stretching during ordinary idle time', () => {
    const visual: CompanionVisual = { type: 'video', videos: {}, clips: { looking: ['look'], stretching: ['stretch'], yawning: ['yawn'], concerned: ['concern'] } }
    expect(availableIdleInterludes(visual)).toEqual(['looking', 'stretching'])
  })
})
