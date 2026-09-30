import { describe, expect, it } from 'vitest'
import { companionVideoStates, type CompanionVisual } from '../../domain/models'
import { availableIdleInterludes, chooseIdleInterlude, chooseNextIdleClip, isSustainedVideoState, isTransientVideoState, nextIdleInterludeDelay } from './companionVideoPlayback'

describe('companion WebM playback policy', () => {
  it('uses the nineteen configured action categories', () => {
    expect(companionVideoStates).toEqual(['celebrating', 'clothes_adjust', 'concerned', 'greeting', 'hair_adjust', 'hands_behind_sway', 'hands_clasped', 'idle', 'lean_forward', 'listening', 'looking', 'nodding', 'playful_sway', 'shoulder_relax', 'shy', 'sleepy', 'speaking', 'stretching', 'yawning'])
  })

  it('keeps only true interaction states sustained and plays looking once', () => {
    expect(isSustainedVideoState('speaking')).toBe(true)
    expect(isTransientVideoState('looking')).toBe(true)
    expect(isTransientVideoState('nodding')).toBe(true)
    expect(isTransientVideoState('clothes_adjust')).toBe(true)
    expect(isTransientVideoState('playful_sway')).toBe(true)
    expect(isTransientVideoState('celebrating')).toBe(true)
  })

  it('keeps daytime interludes neutral and admits night actions at low frequency', () => {
    const visual: CompanionVisual = { type: 'video', videos: {}, clips: { clothes_adjust: ['clothes'], hands_clasped: ['hands'], looking: ['look'], playful_sway: ['playful'], stretching: ['stretch'], yawning: ['yawn'], sleepy: ['sleep'], concerned: ['concern'] } }
    expect(availableIdleInterludes(visual, new Date('2026-09-25T12:00:00'), () => 0)).toEqual(['clothes_adjust', 'hands_clasped', 'looking', 'playful_sway', 'stretching'])
    expect(availableIdleInterludes(visual, new Date('2026-09-25T23:00:00'), () => 0)).toEqual(['clothes_adjust', 'hands_clasped', 'looking', 'playful_sway', 'stretching', 'yawning'])
    expect(availableIdleInterludes(visual, new Date('2026-09-25T02:00:00'), () => 0)).toEqual(['clothes_adjust', 'hands_clasped', 'looking', 'playful_sway', 'stretching', 'yawning', 'sleepy'])
  })

  it('weights subtle interludes and avoids immediately repeating the previous action', () => {
    expect(chooseIdleInterlude(['clothes_adjust', 'playful_sway'], undefined, () => 0)).toBe('clothes_adjust')
    expect(chooseIdleInterlude(['clothes_adjust', 'playful_sway'], 'clothes_adjust', () => 0)).toBe('playful_sway')
  })

  it('keeps the first idle clip as the base and returns to it after a variation', () => {
    const visual: CompanionVisual = { type: 'video', videos: {}, clips: { idle: ['base', 'variation-1', 'variation-2', 'variation-3'] } }
    expect(chooseNextIdleClip(visual, undefined, () => 1)).toBe('base')
    expect(chooseNextIdleClip(visual, 'variation-2', () => 1)).toBe('base')
    expect(chooseNextIdleClip(visual, 'base', () => 0.5)).toBe('base')
    expect(chooseNextIdleClip(visual, 'base', () => 0.99)).toBe('variation-3')
  })

  it('leaves forty-five to ninety seconds of idle between interludes', () => {
    expect(nextIdleInterludeDelay(() => 0)).toBe(45_000)
    expect(nextIdleInterludeDelay(() => 1)).toBe(90_000)
  })
})
