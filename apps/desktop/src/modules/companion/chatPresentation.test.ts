import { describe, expect, it } from 'vitest'
import { chatDimensions, conversationCaption, resolveChatPresentation } from './chatPresentation'
describe('desktop conversation presentation', () => {
  it('expands confirmation without changing the requested lightweight mode', () => {
    expect(resolveChatPresentation('voice', true)).toBe('full')
    expect(resolveChatPresentation('voice', false)).toBe('voice')
    expect(resolveChatPresentation('bubble', true)).toBe('full')
    expect(chatDimensions('bubble')).toEqual({ width: 300, height: 210 })
    expect(chatDimensions('full')).toEqual({ width: 350, height: 480 })
  })
  it('shows the playing sentence before the text that is still being generated', () => {
    const messages = [{ role: 'companion', content: '旧回复' }, { role: 'user', content: '新问题' }]
    expect(conversationCaption('正在念的句子', '稍后才念的内容', messages)).toBe('正在念的句子')
    expect(conversationCaption('', '当前流式内容', messages)).toBe('当前流式内容')
    expect(conversationCaption('', '', messages)).toBe('旧回复')
  })
})
