import { describe, expect, it } from 'vitest'
import { createAiProvider } from './aiProvider'

const request = { chapterId: 'chapter-1', sourceRevision: 1, sourcePreview: '旧院子', prompt: '雨后的旧院子', stylePreset: '温暖手绘' }

describe('AI provider boundary', () => {
  it('keeps the offline mock flow deterministic in shape and network-free', async () => {
    const provider = createAiProvider({ providerId: 'mock', endpoint: '', model: 'mock' })
    expect(await provider.testConnection()).toContain('不会发送网络请求')
    const candidates = await provider.generate(request)
    expect(candidates).toHaveLength(3)
    expect(candidates.every((candidate) => candidate.previewUrl.startsWith('data:image/svg+xml'))).toBe(true)
  })

  it('surfaces typed failure paths without recording a successful generation', async () => {
    const provider = createAiProvider({ providerId: 'mock', endpoint: '', model: 'mock' })
    await expect(provider.generate({ ...request, prompt: '[quota-error]' })).rejects.toThrow('QUOTA_ERROR')
    await expect(provider.generate({ ...request, prompt: '[reject]' })).rejects.toThrow('CONTENT_REJECTED')
  })
})
