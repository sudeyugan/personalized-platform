import { describe, expect, it } from 'vitest'
import { createCompanionProvider } from './companionProvider'

describe('companion provider boundary', () => {
  it('keeps the local mock deterministic and reports whether context was supplied', async () => {
    const provider = createCompanionProvider({ providerId: 'mock', endpoint: '', model: 'mock' })
    await expect(provider.reply({ message: '陪我聊聊', context: '', companionName: '小隅' })).resolves.toContain('没有读取任何文稿')
    await expect(provider.reply({ message: '陪我聊聊', context: '允许的片段', companionName: '小隅' })).resolves.toContain('允许我阅读')
  })

  it('does not send custom-provider content before a protocol is configured', async () => {
    const provider = createCompanionProvider({ providerId: 'custom', endpoint: 'https://example.invalid', model: 'future-model' })
    await expect(provider.testConnection()).resolves.toContain('不会发送内容')
    await expect(provider.reply({ message: '私密内容', context: '正文', companionName: '小隅' })).rejects.toThrow('PROVIDER_PROTOCOL_UNCONFIGURED')
  })
})
