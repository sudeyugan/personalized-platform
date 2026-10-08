import { describe, expect, it, vi } from 'vitest'
import { createPostWakeAudio, pcm16Base64 } from './postWakeAudio'

describe('post-wake audio', () => {
  it('encodes clamped signed little-endian PCM', () => {
    const raw = atob(pcm16Base64([-2, 0, 2, Number.NaN]))
    expect(Array.from(raw, (char) => char.charCodeAt(0))).toEqual([0, 128, 0, 0, 255, 127, 0, 0])
  })
  it('buffers only explicitly supplied samples and clears on end', () => {
    const audio = createPostWakeAudio(), send = vi.fn()
    audio.attach(send)
    expect(send).not.toHaveBeenCalled()
    audio.detach()
    audio.push(Array(3200).fill(0.25))
    audio.attach(send)
    expect(send).toHaveBeenCalledTimes(1)
    audio.close()
    audio.push(Array(3200).fill(1)); audio.attach(send)
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('bounds connection-start buffering and retains unsent audio on failure', () => {
    const audio = createPostWakeAudio(), send = vi.fn()
    for (let index = 0; index < 10; index++) audio.push(Array(16000).fill(0))
    audio.attach(send)
    expect(send).toHaveBeenCalledTimes(20)
    const broken = vi.fn(() => { throw Error('not ready') })
    audio.attach(broken); audio.push(Array(3200).fill(0))
    audio.attach(send)
    expect(send).toHaveBeenCalledTimes(21)
  })
})
