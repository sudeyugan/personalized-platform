import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestModel } from '../../../../mobile/src/model'
afterEach(() => {
  delete window.YiyuMobile
  vi.restoreAllMocks()
})
function native(result?: string) {
  const chat = vi.fn((id: string, _prompt: string) => {
    if (result !== undefined)
      window.dispatchEvent(
        new CustomEvent('yiyu-chat-result', { detail: { id, success: true, content: result } }),
      )
  })
  window.YiyuMobile = {
    chat,
    showPet() {},
    hidePet() {},
    saveApiKey() {
      return true
    },
    ideaRound: chat,
  }
  return chat
}
describe('shared mobile model privacy and cancellation', () => {
  it('blocks credential material before either model entry point', async () => {
    const chat = native('unused')
    await expect(requestModel('api_key=abcdefghijk123456789', 'chat')).rejects.toThrow('密钥')
    await expect(requestModel('sk-abcdefghijk123456789abcdef', 'idea')).rejects.toThrow('密钥')
    expect(chat).not.toHaveBeenCalled()
  })
  it('cancels before sending when the masked preview is declined', async () => {
    const chat = native('unused')
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await expect(requestModel('联系 somebody@example.org', 'chat')).rejects.toThrow('没有发送')
    expect(chat).not.toHaveBeenCalled()
  })
  it('sends masked content and restores the response only on the device', async () => {
    const chat = native('已记下 [EMAIL_1]')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    expect(await requestModel('联系 somebody@example.org', 'chat')).toBe('已记下 somebody@example.org')
    expect(chat.mock.calls[0][1]).not.toContain('somebody@example.org')
  })
  it('does not accept a late result after cancellation', async () => {
    const chat = native(),
      controller = new AbortController()
    const waiting = requestModel('一次虚构查询', 'chat', controller.signal)
    controller.abort()
    await expect(waiting).rejects.toThrow('已暂停')
    window.dispatchEvent(
      new CustomEvent('yiyu-chat-result', {
        detail: { id: chat.mock.calls[0][0], success: true, content: '迟到的结果' },
      }),
    )
    native('新的结果')
    expect(await requestModel('新的查询', 'chat')).toBe('新的结果')
  })
  it('does not open a hidden privacy confirmation or send protected text in the background', async () => {
    const chat = native('unused')
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const confirm = vi.spyOn(window, 'confirm')
    await expect(requestModel('联系 somebody@example.org', 'chat')).rejects.toThrow('没有向模型发送')
    expect(chat).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled()
  })
})
