import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCompanionProvider, deleteCompanionKey, storeCompanionKey } from './companionProvider'

const invokeMock = vi.hoisted(() => vi.fn())
const localTime = { timeZone: 'Asia/Shanghai' as const, date: '2026-09-22', time: '12:00:00', weekday: '星期二', period: '中午' }
vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class<T> {
    onmessage?: (message: T) => void
  },
}))

function streamChunks(...chunks: unknown[]) {
  return (_command: string, args: { onEvent: { onmessage?: (chunk: unknown) => void } }) => {
    chunks.forEach((chunk) => args.onEvent.onmessage?.(chunk))
    return Promise.resolve()
  }
}

describe('companion provider boundary', () => {
  beforeEach(() => invokeMock.mockReset())

  it('keeps the local mock behind the model-provider abstraction', async () => {
    const provider = createCompanionProvider({ providerId: 'mock', endpoint: '', model: 'mock' })
    const response = await provider.generate({ messages: [{ role: 'user', content: '陪我聊聊' }], context: { page: 'home', companion: { name: '小隅' }, localTime }, tools: [] })
    expect(response.type).toBe('text')
  })

  it('keeps arbitrary custom providers offline', async () => {
    const provider = createCompanionProvider({ providerId: 'custom', endpoint: 'https://example.invalid', model: 'future-model' })
    await expect(provider.testConnection()).rejects.toThrow('尚未授权联网')
    await expect(provider.generate({ messages: [{ role: 'user', content: '私密内容' }], context: { page: 'home', companion: { name: '小隅' }, localTime }, tools: [] })).rejects.toThrow('PROVIDER_PROTOCOL_UNCONFIGURED')
  })

  it('maps DeepSeek text and namespaced tool calls through the Tauri command', async () => {
    await storeCompanionKey('test-only-key')
    const provider = createCompanionProvider({ providerId: 'deepseek', endpoint: 'https://api.deepseek.com', model: 'deepseek-chat' })
    invokeMock.mockImplementationOnce(streamChunks({ choices: [{ delta: { content: '连接正常' } }] }, { done: true }))
    await expect(provider.testConnection()).resolves.toContain('DeepSeek 已连接')
    invokeMock.mockImplementationOnce(streamChunks(
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'character__search', arguments: '{"query":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"林夏"}' } }] } }] },
      { done: true },
    ))
    const response = await provider.generate({
      messages: [{ role: 'user', content: '查找林夏' }],
      context: { page: 'writing', companion: { name: '小隅' }, localTime, activeWork: { id: 'work-1', title: '星河' } },
      tools: [{ name: 'character.search', description: '搜索人物', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, capability: 'read', risk: 'read_only', scope: 'records' }],
    })
    expect(response).toMatchObject({ type: 'tool_call', call: { name: 'character.search', arguments: { query: '林夏' } } })
    expect(invokeMock).toHaveBeenLastCalledWith('companion_chat_completion_stream', expect.objectContaining({
      endpoint: 'https://api.deepseek.com',
      tools: [expect.objectContaining({ function: expect.objectContaining({ name: 'character__search' }) })],
    }))
    await deleteCompanionKey()
  })
})
