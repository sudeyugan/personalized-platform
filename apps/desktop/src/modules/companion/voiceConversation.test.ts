import { describe, expect, it } from 'vitest'
import { hasBargeInSignal, isDuplicateUtterance, isLikelyPlaybackEcho, resolveVoiceCommand } from './voiceConversation'

describe('voice conversation rules', () => {
  it('recognizes session commands without treating ordinary questions as commands', () => {
    expect(resolveVoiceCommand('小鱼，先这样。')).toBe('end')
    expect(resolveVoiceCommand('隐藏起来')).toBe('hide')
    expect(resolveVoiceCommand('小鱼，现在几点？')).toBeUndefined()
  })

  it('filters playback-like transcripts but preserves different interruptions', () => {
    expect(isLikelyPlaybackEcho('今天下午可能会下雨', '今天下午可能会下雨，出门记得带伞。')).toBe(true)
    expect(isLikelyPlaybackEcho('等等，我想问另一件事', '今天下午可能会下雨，出门记得带伞。')).toBe(false)
  })

  it('requires a meaningful partial and suppresses immediate duplicate commits', () => {
    expect(hasBargeInSignal('等一下')).toBe(true)
    expect(hasBargeInSignal('嗯')).toBe(false)
    expect(isDuplicateUtterance({ text: '继续说', at: 1_000 }, '继续说。', 2_000)).toBe(true)
    expect(isDuplicateUtterance({ text: '继续说', at: 1_000 }, '继续说。', 4_000)).toBe(false)
  })
})
