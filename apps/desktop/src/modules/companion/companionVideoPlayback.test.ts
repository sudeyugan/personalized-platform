import { describe, expect, it } from 'vitest'
import { companionVideoStates, type CompanionVisual } from '../../domain/models'
import { availableIdleInterludes, chooseNextIdleClip, configuredIdleInterludes, createVideoPlaybackRotation, isSustainedVideoState, isTransientVideoState, nextIdleInterludeDelay } from './companionVideoPlayback'

describe('companion WebM playback policy', () => {
  it('uses eighteen configured action slots without the retired shoulder action', () => {
    expect(companionVideoStates).toEqual(['celebrating', 'clothes_adjust', 'concerned', 'greeting', 'hair_adjust', 'hands_behind_sway', 'hands_clasped', 'idle', 'lean_forward', 'listening', 'looking', 'nodding', 'playful_sway', 'shy', 'sleepy', 'speaking', 'stretching', 'yawning'])
  })

  it('keeps true interaction states sustained and natural or semantic actions transient', () => {
    expect(isSustainedVideoState('speaking')).toBe(true)
    for (const state of ['looking', 'nodding', 'clothes_adjust', 'playful_sway', 'celebrating'] as const) {
      expect(isTransientVideoState(state)).toBe(true)
      expect(isSustainedVideoState(state)).toBe(false)
    }
  })

  it('keeps daytime interludes neutral and admits night actions only in their time windows', () => {
    const visual: CompanionVisual = { type: 'video', videos: {}, clips: { clothes_adjust: ['clothes'], hands_clasped: ['hands'], looking: ['look'], playful_sway: ['playful'], stretching: ['stretch'], yawning: ['yawn'], sleepy: ['sleep'], concerned: ['concern'], celebrating: ['celebrate'], shy: ['shy'], nodding: ['nod'] } }
    const day = ['clothes_adjust', 'hands_clasped', 'looking', 'playful_sway', 'stretching']
    expect(availableIdleInterludes(visual, new Date('2026-10-02T12:00:00'), () => 0)).toEqual(day)
    expect(availableIdleInterludes(visual, new Date('2026-10-02T23:00:00'), () => 1)).toEqual([...day, 'yawning'])
    expect(availableIdleInterludes(visual, new Date('2026-10-02T02:00:00'), () => 0)).toEqual([...day, 'yawning', 'sleepy'])
    expect(availableIdleInterludes(visual, new Date('2026-10-02T02:00:00'), () => 0.12)).toEqual([...day, 'yawning'])
    expect(availableIdleInterludes(visual, new Date('2026-10-02T06:00:00'), () => 0)).toEqual(day)
  })

  it('uses only configured clips, including legacy mappings and night-only libraries', () => {
    const visual: CompanionVisual = { type: 'video', videos: { looking: 'legacy' }, clips: { clothes_adjust: [], yawning: ['night'] } }
    expect(availableIdleInterludes(visual, new Date('2026-10-02T12:00:00'))).toEqual(['looking'])
    expect(configuredIdleInterludes(visual)).toEqual(['looking', 'yawning'])
    expect(configuredIdleInterludes({ type: 'portrait' })).toEqual([])
  })

  it('covers every eligible action per round without repeating at the round boundary', () => {
    const rotation = createVideoPlaybackRotation(() => 0)
    const actions = ['clothes_adjust', 'hair_adjust', 'hands_clasped', 'playful_sway']
    let previous: string | undefined
    for (let round = 0; round < 4; round++) {
      const chosen = actions.map(() => {
        const next = rotation.choose('interludes', actions)
        expect(next).not.toBe(previous)
        previous = next
        return next
      })
      expect(new Set(chosen)).toEqual(new Set(actions))
    }
  })

  it('handles empty, single, duplicate, removed and newly added clips', () => {
    const rotation = createVideoPlaybackRotation(() => 1)
    expect(rotation.choose('clips', [])).toBeUndefined()
    expect(rotation.choose('clips', ['one', 'one'])).toBe('one')
    expect(rotation.choose('clips', ['one'])).toBe('one')
    expect(rotation.choose('clips', ['one', 'new'])).toBe('new')
    expect(rotation.choose('clips', ['replacement'])).toBe('replacement')
    expect(rotation.choose('clips', ['replacement'])).toBe('replacement')
  })

  it('does not build up a playback debt for an action added late at night', () => {
    const rotation = createVideoPlaybackRotation(() => 0)
    for (let index = 0; index < 60; index++) rotation.choose('interludes', ['clothes', 'hair'])
    expect(rotation.choose('interludes', ['clothes', 'hair', 'yawn'])).toBe('yawn')
    const round = Array.from({ length: 3 }, () => rotation.choose('interludes', ['clothes', 'hair', 'yawn']))
    expect(new Set(round)).toEqual(new Set(['clothes', 'hair', 'yawn']))
  })

  it('rotates multiple clips independently for each action', () => {
    const rotation = createVideoPlaybackRotation(() => 0)
    expect(rotation.choose('clips:speaking', ['s1', 's2'])).toBe('s1')
    expect(rotation.choose('clips:listening', ['l1', 'l2'])).toBe('l1')
    expect(rotation.choose('clips:speaking', ['s1', 's2'])).toBe('s2')
    expect(rotation.choose('clips:listening', ['l1', 'l2'])).toBe('l2')
    expect(rotation.choose('clips:speaking', ['s1', 's2'])).toBe('s1')
  })

  it('keeps the first idle clip as base with half of base endings choosing a variation', () => {
    const visual: CompanionVisual = { type: 'video', videos: {}, clips: { idle: ['base', 'variation-1', 'variation-2', 'variation-3'] } }
    expect(chooseNextIdleClip(visual, undefined, () => 1)).toBe('base')
    expect(chooseNextIdleClip(visual, 'variation-2', () => 1)).toBe('base')
    expect(chooseNextIdleClip(visual, 'base', () => 0.49)).toBe('base')
    expect(chooseNextIdleClip(visual, 'base', () => 0.99)).toBe('variation-3')
    const rotation = createVideoPlaybackRotation(() => 0)
    const variations = Array.from({ length: 3 }, () => chooseNextIdleClip(visual, 'base', () => 0.5, rotation))
    expect(variations).toEqual(['variation-1', 'variation-2', 'variation-3'])
    expect(chooseNextIdleClip({ type: 'video', videos: { idle: 'only' } }, 'only', () => 1, rotation)).toBe('only')
    expect(chooseNextIdleClip({ type: 'portrait' })).toBeUndefined()
  })

  it('leaves thirty to fifty-five seconds of idle between interludes', () => {
    expect(nextIdleInterludeDelay(() => 0)).toBe(30_000)
    expect(nextIdleInterludeDelay(() => 1)).toBe(55_000)
  })
})
