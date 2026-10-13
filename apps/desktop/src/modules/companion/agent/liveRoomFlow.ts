import type { AgentToolCall, AgentToolDefinition, AgentToolResult } from './types'
import { liveStatusReply } from './liveStatusReply'

interface FlowDecision { nextCall?: AgentToolCall; reply?: string }
const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase()

// A snippet may mention other streamers or embed instructions/links. It is not
// identity evidence. Accept only direct room results with an exact name segment.
export function matchingLiveRooms(data: unknown, name: string): string[] {
  if (!Array.isArray(data)) return []
  const expected = normalize(name)
  const urls = new Set<string>()
  for (const item of data.slice(0, 30)) {
    if (!item || typeof item !== 'object' || !('url' in item) || !('title' in item) || typeof item.url !== 'string' || typeof item.title !== 'string') continue
    const title = normalize(item.title)
    const named = title === expected || title === `${expected}的直播间` || title === `${expected}直播间`
      || title.split(/\s*[-–—|]\s*/u).some(part => part === expected || part === `${expected}的直播间` || part === `${expected}直播间`)
    if (!named) continue
    try {
      const url = new URL(item.url)
      if (url.protocol !== 'https:' || url.hostname !== 'live.bilibili.com' || url.port || url.username || url.password) continue
      if (!/^\/[1-9]\d{0,11}\/?$/u.test(url.pathname)) continue
      urls.add(`https://live.bilibili.com/${url.pathname.split('/')[1]}`)
    } catch { /* Ignore malformed or redirected public results. */ }
  }
  return [...urls]
}

export class LiveRoomFlow {
  readonly initialCall?: AgentToolCall
  readonly unavailableReply?: string
  private pending: AgentToolCall | undefined
  private searches = 0
  private target: string | undefined
  private readonly canOpen: boolean
  private readonly name: string
  private readonly mode: 'open' | 'status'

  constructor(name: string, tools: AgentToolDefinition[], mode: 'open' | 'status' = 'open') {
    this.name = name
    this.mode = mode
    this.canOpen = tools.some(tool => tool.name === 'system.open')
    if (mode === 'status' && !tools.some(tool => tool.name === 'web.live_status')) {
      this.unavailableReply = '当前环境没有公开开播状态工具，搜索摘要不能确认实时开播。'
      return
    }
    if (!tools.some(tool => tool.name === 'web.search')) {
      this.unavailableReply = '当前环境没有联网搜索工具，无法核对这位主播的直播间。请提供官方直播间链接。'
      return
    }
    this.initialCall = this.search()
  }

  private call(name: string, args: Record<string, unknown>) {
    this.pending = { id: `live-room-${crypto.randomUUID()}`, name, arguments: args }
    return this.pending
  }

  private search() {
    this.searches += 1
    const query = this.searches === 1 ? `B站 "${this.name}" 直播间` : `site:live.bilibili.com "${this.name}"`
    return this.call('web.search', { query })
  }

  advance(call: AgentToolCall, result: AgentToolResult): FlowDecision | undefined {
    if (call.id !== this.pending?.id || call.name !== this.pending.name) return undefined
    this.pending = undefined
    if (call.name === 'web.live_status') return { reply: liveStatusReply(result, this.name, this.target!) }
    if (!result.success) {
      if (call.name === 'web.search' && this.searches === 1 && result.error?.message.startsWith('WEB_SEARCH_EMPTY:')) return { nextCall: this.search() }
      return { reply: `${call.name === 'system.open' ? '没有打开直播间' : '没有完成直播间搜索'}：${result.error?.message.slice(0, 300) || '工具执行失败'}。` }
    }
    if (call.name === 'system.open') {
      const data = result.data as { opened?: unknown; target?: unknown; status?: unknown } | undefined
      const submitted = data?.opened === true && data.target === this.target && data.status === 'submitted_to_default_handler'
      return { reply: submitted
        ? `已将公开搜索中名称匹配的「${this.name}」直播间交给 Windows 默认浏览器打开：${this.target}。这不代表页面已加载或主播正在直播。`
        : '打开工具没有返回可核对的成功状态，暂时不能确认已打开直播间。' }
    }
    const rooms = matchingLiveRooms(result.data, this.name)
    if (rooms.length > 1) return { reply: `找到多个名称匹配的直播间，没有自动选择。请确认官方房间号或粘贴直播间链接：\n${rooms.map(url => `- ${url}`).join('\n')}` }
    if (rooms.length === 1) {
      this.target = rooms[0]
      if (this.mode === 'status') return { nextCall: this.call('web.live_status', { roomUrl: this.target, expectedName: this.name }) }
      return this.canOpen ? { nextCall: this.call('system.open', { target: this.target }) }
        : { reply: `找到名称匹配的直播间，但当前环境没有打开网页的工具：${this.target}` }
    }
    if (this.searches === 1) return { nextCall: this.search() }
    return { reply: `公开搜索没有找到能明确匹配「${this.name}」的 B 站直播间，没有猜测或打开链接。请补充准确昵称、房间号或官方直播间链接。` }
  }
}
