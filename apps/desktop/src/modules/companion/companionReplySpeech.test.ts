import { describe, expect, it, vi } from 'vitest'
import { createReplySpeechQueue } from './companionReplySpeech'

function options() {
  return {
    provider: { synthesize: vi.fn().mockResolvedValue(new Blob(['audio'])) },
    limit: Number.POSITIVE_INFINITY,
    sanitize: (text: string) => 'protected:' + text,
    isActive: () => true,
    play: vi.fn().mockResolvedValue(undefined),
    onLimit: vi.fn(),
  }
}
describe('companion reply speech queue', () => {
  it('synthesizes protected sentences and plays them in order, including the final tail', async () => {
    const config = options()
    await createReplySpeechQueue(config).speak('第一句。第二句。末尾')
    expect(config.provider.synthesize.mock.calls).toEqual([['protected:第一句。'], ['protected:第二句。'], ['protected:末尾']])
    expect(config.play.mock.calls.map((call) => call[1])).toEqual(['第一句。', '第二句。', '末尾'])
    expect(config.onLimit).not.toHaveBeenCalled()
  })
  it('stops at the length limit without truncating the first complete sentence', async () => {
    const config = { ...options(), limit: 2 }
    await createReplySpeechQueue(config).speak('第一句。第二句。第三句。')
    expect(config.provider.synthesize).toHaveBeenCalledTimes(1)
    expect(config.onLimit).toHaveBeenCalledTimes(1)
  })
  it('keeps the existing first-paragraph speech boundary', async () => {
    const config = options()
    await createReplySpeechQueue(config).speak('第一段\n\n第二段。')
    expect(config.provider.synthesize).toHaveBeenCalledTimes(1)
    expect(config.onLimit).toHaveBeenCalledTimes(1)
  })
  it('does not enqueue an inactive turn or play audio after cancellation', async () => {
    const config = options()
    let active = false
    config.isActive = () => active
    await createReplySpeechQueue(config).speak('已取消。')
    expect(config.provider.synthesize).not.toHaveBeenCalled()
    active = true
    config.provider.synthesize.mockImplementation(async () => { active = false; return new Blob(['audio']) })
    await createReplySpeechQueue(config).speak('取消中。')
    expect(config.play).not.toHaveBeenCalled()
  })
  it('propagates synthesis failures and does not attempt playback', async () => {
    const config = options()
    config.provider.synthesize.mockRejectedValue(new Error('synthesis failed'))
    await expect(createReplySpeechQueue(config).speak('失败。')).rejects.toThrow('synthesis failed')
    expect(config.play).not.toHaveBeenCalled()
  })
})
