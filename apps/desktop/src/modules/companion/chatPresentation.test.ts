import { describe, expect, it } from 'vitest'
import { chatDimensions, compactText, conversationCaption, resolveChatPresentation } from './chatPresentation'
describe('desktop conversation presentation', () => {
  it('has a smaller subtitle window and separate WebM proportions', () => {
    expect(chatDimensions('voice', 'pet')).toEqual({ width: 280, height: 160 })
    expect(chatDimensions('voice', 'webm')).toEqual({ width: 320, height: 160 })
    expect(chatDimensions('full', 'webm').width).toBe(380)
  })
  it('previews plain readable text without modifying full messages or splitting emoji', () => {
    expect(compactText('## **你好**\n- [链接](https://example.test)\n![图](file.png)').text).toBe('你好 链接')
    expect(compactText('🙂🙂🙂🙂', 3)).toEqual({ text: '🙂🙂…', truncated: true })
    expect(compactText('短句')).toEqual({ text: '短句', truncated: false })
  })
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
