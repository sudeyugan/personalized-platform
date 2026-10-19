import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Records } from '@yiyu/sync'
const fixture = vi.hoisted(() => ({
  records: {} as Records,
  prompts: [] as string[],
  reply: true,
}))
vi.mock('../../../../mobile/src/repository', () => ({
  getSnapshot: () => ({ records: fixture.records }),
  changeRecords: async (change: (records: Records) => Records) => {
    fixture.records = change(fixture.records)
  },
}))
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  fixture.records = {}
  fixture.prompts = []
  fixture.reply = true
  window.YiyuMobile = {
    showPet() {},
    hidePet() {},
    saveApiKey: () => true,
    chat() {},
    chatWithContext(id, material) {
      fixture.prompts.push(material)
      if (fixture.reply)
        window.dispatchEvent(
          new CustomEvent('yiyu-chat-result', {
            detail: { id, success: true, content: '普通回复' },
          }),
        )
    },
  }
})
afterEach(() => {
  delete window.YiyuMobile
  vi.restoreAllMocks()
})
describe('mobile conversation continuity and isolation', () => {
  it('blocks credential text before saving to the shared outbox, not only before model egress', async () => {
    const chat = await import('../../../../mobile/src/companion/conversation')
    await expect(chat.sendConversation('api_key=abcdefghijk123456789')).rejects.toThrow('密钥')
    expect(fixture.records).toEqual({}); expect(fixture.prompts).toEqual([])
  })
  it('continues ordinary chat with bounded shared history but no arbitrary library records', async () => {
    fixture.records = {
      'diary/2026-10-19': { title: 'private diary', content: '不应附带的资料' },
    }
    const chat = await import('../../../../mobile/src/companion/conversation')
    await chat.sendConversation('第一句')
    await chat.sendConversation('第二句')
    expect(JSON.parse(fixture.prompts[1])).toEqual([
      { role: 'user', content: '第一句' },
      { role: 'assistant', content: '普通回复' },
      { role: 'user', content: '第二句' },
    ])
    expect(fixture.prompts.join('')).not.toContain('不应附带')
    expect(Object.keys(fixture.records).filter((key) => key.startsWith('chat/'))).toHaveLength(4)
  })
  it('does not upload private chat or use it after switching back to ordinary', async () => {
    const chat = await import('../../../../mobile/src/companion/conversation')
    chat.setConversationPrivate(true)
    await chat.sendConversation('仅本机的内容')
    expect(fixture.records).toEqual({})
    expect(chat.conversationMessages({})).toHaveLength(2)
    chat.setConversationPrivate(false)
    await chat.sendConversation('普通问候')
    expect(fixture.prompts[1]).not.toContain('仅本机')
    chat.setConversationPrivate(true)
    expect(chat.conversationMessages(fixture.records)[0].content).toBe('仅本机的内容')
  })
  it('stops waiting without appending a late response or accepting parallel sends', async () => {
    fixture.reply = false
    const chat = await import('../../../../mobile/src/companion/conversation')
    const pending = chat.sendConversation('等一等')
    await vi.waitFor(() => expect(fixture.prompts).toHaveLength(1))
    await expect(chat.sendConversation('并行')).rejects.toThrow('上一轮')
    chat.stopConversation()
    await expect(pending).rejects.toThrow('已暂停')
    expect(Object.keys(fixture.records)).toHaveLength(1)
    expect(chat.conversationSnapshot().busy).toBe(false)
  })
  it('keeps the old optional history local, and clear does not resurrect it after reload', async () => {
    localStorage.setItem('yiyu.mobile.chat-remember', 'true')
    localStorage.setItem(
      'yiyu.mobile.chat.v1',
      JSON.stringify([{ id: 'old', role: 'user', content: '旧私密记录' }]),
    )
    let chat = await import('../../../../mobile/src/companion/conversation')
    chat.setConversationPrivate(true)
    expect(chat.conversationMessages({})[0].content).toBe('旧私密记录')
    await chat.clearConversation()
    vi.resetModules()
    chat = await import('../../../../mobile/src/companion/conversation')
    expect(chat.conversationMessages({})).toEqual([])
    expect(fixture.records).toEqual({})
  })
})
