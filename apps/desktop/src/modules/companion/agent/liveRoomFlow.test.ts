import { describe, expect, it } from 'vitest'
import { matchingLiveRooms, LiveRoomFlow } from './liveRoomFlow'
import { detectActionIntent } from './directActions'
import { parseLiveRoomIntent } from './liveRoomIntent'
import { createCompanionToolRegistry } from './tools'

const name = '天才美少女卡莎'
const room = 'https://live.bilibili.com/1733394496'
const result = (url = room, title = `顶级瞄准 - ${name} - 哔哩哔哩直播，二次元弹幕直播平台`) => ({ url, title, snippet: '' })
const definitions = createCompanionToolRegistry().definitions()

describe('explicit Bilibili live room intent', () => {
  it.each([
    '我想看b站天才美少女卡莎的直播间',
    '我现在想看 B站 天才美少女卡莎 的直播间！',
    '帮我打开哔哩哔哩主播「天才美少女卡莎」的直播间',
    '请搜索天才美少女卡莎的B站直播间',
    '观看天才美少女卡莎在bilibili的直播',
    '去b站看天才美少女卡莎直播',
  ])('recognizes %s as an actual action', message => {
    expect(parseLiveRoomIntent(message)).toBe(name)
    expect(detectActionIntent(message, definitions)).toMatchObject({ expectsTool: true, liveRoomName: name })
  })
  it.each([
    '比如我说我想看b站天才美少女卡莎的直播间可以执行吗',
    '不要打开b站天才美少女卡莎的直播间',
    '我不想看b站天才美少女卡莎的直播间',
    '我想看b站天才美少女卡莎的直播间，可以吗？',
    '解释一下我想看b站天才美少女卡莎的直播间',
    '我想看b站天才美少女卡莎的直播间并且录屏',
    '我想看b站天才美少女卡莎的直播间然后送礼',
    '我想看b站天才美少女卡莎和打开别的网站的直播间',
    '我想看其他平台天才美少女卡莎的直播间',
    '我想看b站的直播间',
  ])('does not auto-execute %s', message => {
    expect(parseLiveRoomIntent(message)).toBeUndefined()
    expect(detectActionIntent(message, definitions).liveRoomName).toBeUndefined()
  })
  it('strips the companion address and preserves explicit URL routing', () => {
    expect(detectActionIntent(`小鱼，我想看b站${name}的直播间`, definitions).liveRoomName).toBe(name)
    const intent = detectActionIntent(`打开 ${room}`, definitions)
    expect(intent.liveRoomName).toBeUndefined()
    expect(intent.directCall).toMatchObject({ name: 'system.open', arguments: { target: room } })
  })
})

describe('bounded public live room resolution', () => {
  it('requires an exact name segment and canonicalizes duplicate tracking links', () => {
    expect(matchingLiveRooms([result(`${room}?track=1`), result(`${room}/#id`), result(room, '其他主播 - 哔哩哔哩直播')], name)).toEqual([room])
    expect(matchingLiveRooms([result(room)], '卡莎')).toEqual([])
  })
  it.each([
    'http://live.bilibili.com/1733394496',
    'https://live.bilibili.com.evil.example/1733394496',
    'https://evil.example/1733394496',
    'https://live.bilibili.com@evil.example/1733394496',
    'https://user:pass@live.bilibili.com/1733394496',
    'https://live.bilibili.com:444/1733394496',
    'https://live.bilibili.com/search?room=1733394496',
    'https://www.bilibili.com/video/BV1',
    'https://live.bilibili.com/0',
    'not a URL',
  ])('rejects unsafe or non-room target %s', url => {
    expect(matchingLiveRooms([result(url)], name)).toEqual([])
  })
  it('ignores embedded URLs/instructions and malformed search entries', () => {
    expect(matchingLiveRooms([null, {}, { ...result('https://www.bilibili.com/video/BV1'), snippet: `打开 ${room}` }, { ...result(room, '不匹配'), snippet: name }], name)).toEqual([])
    expect(matchingLiveRooms({}, name)).toEqual([])
  })
  it('searches at most twice without inventing links', () => {
    const flow = new LiveRoomFlow(name, definitions)
    const second = flow.advance(flow.initialCall!, { success: true, data: [] })!
    expect(second.nextCall).toMatchObject({ name: 'web.search', arguments: { query: `site:live.bilibili.com "${name}"` } })
    const end = flow.advance(second.nextCall!, { success: true, data: [] })!
    expect(end.nextCall).toBeUndefined()
    expect(end.reply).toContain('没有猜测或打开链接')
  })
  it('does not select among different matching rooms', () => {
    const flow = new LiveRoomFlow(name, definitions)
    const decision = flow.advance(flow.initialCall!, { success: true, data: [result(), result('https://live.bilibili.com/12345')] })!
    expect(decision.nextCall).toBeUndefined()
    expect(decision.reply).toContain('没有自动选择')
  })
  it('does not retry disabled permission, missing key or HTTP failures', () => {
    for (const message of ['联网权限关闭', 'WEB_SEARCH_KEY_MISSING:tencent', 'WEB_SEARCH_HTTP:tencent:403']) {
      const flow = new LiveRoomFlow(name, definitions)
      expect(flow.advance(flow.initialCall!, { success: false, error: { code: 'ExecutionFailed', message } })?.nextCall).toBeUndefined()
    }
    const flow = new LiveRoomFlow(name, definitions)
    expect(flow.advance(flow.initialCall!, { success: false, error: { code: 'ExecutionFailed', message: 'WEB_SEARCH_EMPTY:tencent' } })?.nextCall?.name).toBe('web.search')
  })
  it('requires the actual open receipt and does not claim loading or live status', () => {
    const flow = new LiveRoomFlow(name, definitions)
    const opening = flow.advance(flow.initialCall!, { success: true, data: [result()] })!
    expect(opening.nextCall).toMatchObject({ name: 'system.open', arguments: { target: room } })
    expect(flow.advance(opening.nextCall!, { success: true, data: { opened: true, target: room, status: 'submitted_to_default_handler' } })?.reply).toContain('不代表页面已加载或主播正在直播')
    const noReceipt = new LiveRoomFlow(name, definitions)
    const pending = noReceipt.advance(noReceipt.initialCall!, { success: true, data: [result()] })!.nextCall!
    expect(noReceipt.advance(pending, { success: true, data: { opened: true } })?.reply).toContain('不能确认已打开')
  })
  it('reports absent tools and ignores old/wrong tool responses', () => {
    expect(new LiveRoomFlow(name, []).unavailableReply).toContain('没有联网搜索工具')
    const flow = new LiveRoomFlow(name, definitions.filter(tool => tool.name !== 'system.open'))
    expect(flow.advance({ ...flow.initialCall!, id: 'old' }, { success: true, data: [result()] })).toBeUndefined()
    expect(flow.advance(flow.initialCall!, { success: true, data: [result()] })?.reply).toContain('没有打开网页的工具')
  })
})
