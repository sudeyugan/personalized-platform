import { Channel, invoke } from '@tauri-apps/api/core'
import type { AgentMessage, AgentModelProvider, AgentModelRequest, AgentModelResponse, AgentToolResult } from '../modules/companion/agent/types'

const isTauriRuntime = () => '__TAURI_INTERNALS__' in window
const companionSecretId = 'companion-provider'

function latestUserMessage(messages: AgentMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
}

function latestToolMessage(messages: AgentMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'tool')
}

function toolAnswer(message: AgentMessage): string {
  let result: AgentToolResult
  try {
    result = JSON.parse(message.content) as AgentToolResult
  } catch {
    return '工具返回了无法解析的结果，我没有据此作出判断。'
  }
  if (!result.success) return `这次无法完成查询：${result.error?.message ?? '未知工具错误'}。`
  const rows = Array.isArray(result.data) ? result.data as Record<string, unknown>[] : undefined
  if (message.toolName === 'character.search') {
    if (!rows?.length) return '在当前获准读取的人物资料里，没有找到相符的人物。'
    return `找到了：${rows.map((item) => `${item.name}${item.summary ? `（${item.summary}）` : ''}`).join('；')}。`
  }
  if (message.toolName === 'place.search') {
    if (!rows?.length) return '在当前获准读取的地点资料里，没有找到相符地点。'
    return `找到了：${rows.map((item) => `${item.name}${item.description ? `（${item.description}）` : ''}`).join('；')}。`
  }
  if (message.toolName === 'timeline.search') {
    if (!rows?.length) return '在当前获准读取的时间线里，没有找到相关事件。'
    return `找到了：${rows.map((item) => `${item.title}${item.displayTime ? `（${item.displayTime}）` : ''}`).join('；')}。`
  }
  if (message.toolName === 'chapter.search') {
    if (!rows?.length) return '在当前获准读取的章节里，没有找到这段内容。'
    return `找到 ${rows.length} 处相关章节：${rows.map((item) => `《${item.title}》：${item.excerpt}`).join('；')}。`
  }
  if (message.toolName === 'chapter.get') {
    const chapter = result.data as Record<string, unknown> | undefined
    return chapter && chapter.found !== false ? `《${chapter.title}》的相关内容是：${chapter.plainText}` : '没有找到这个已授权章节。'
  }
  if (message.toolName === 'work.get_current') {
    const work = result.data as Record<string, unknown> | undefined
    return work && work.found !== false ? `当前作品是《${work.title}》，共有 ${work.chapterCount} 个章节。` : '当前作品尚未授权给伙伴读取。'
  }
  return '查询已完成。'
}

function queryFromMessage(message: string) {
  const quoted = message.match(/[「『“"]([^」』”"]+)[」』”"]/)
  if (quoted) return quoted[1].trim()
  const named = message.match(/叫([^，。！？?]{1,30}?)(?:的)?(?:人物|角色)/)
  if (named) return named[1].trim()
  return message.replace(/我之前|有没有|帮我|找一下|哪里|提到过|人物|角色|章节|请问|[，。！？?]/g, ' ').trim()
}

class MockCompanionModel implements AgentModelProvider {
  readonly id = 'mock'

  async testConnection() {
    return '本地伙伴 Mock Agent 可用，不会发送网络请求。'
  }

  async generate(request: AgentModelRequest, options?: { onTextDelta?: (delta: string) => void; signal?: AbortSignal }): Promise<AgentModelResponse> {
    const tool = latestToolMessage(request.messages)
    if (tool) {
      const text = toolAnswer(tool)
      options?.onTextDelta?.(text)
      return { type: 'text', text }
    }
    const message = latestUserMessage(request.messages)
    if (message.includes('[network-error]')) throw new Error('NETWORK_ERROR:模拟网络不可用')
    if (/人物|角色|叫.+(?:人物|角色)/.test(message)) {
      return { type: 'tool_call', call: { id: `call-${crypto.randomUUID()}`, name: 'character.search', arguments: { query: queryFromMessage(message) } } }
    }
    if (/地点|地方|场所|地址/.test(message)) {
      return { type: 'tool_call', call: { id: `call-${crypto.randomUUID()}`, name: 'place.search', arguments: { query: queryFromMessage(message) } } }
    }
    if (/时间线|事件|什么时候/.test(message)) {
      return { type: 'tool_call', call: { id: `call-${crypto.randomUUID()}`, name: 'timeline.search', arguments: { query: queryFromMessage(message) } } }
    }
    if (/哪里|提到|查找|搜索|章节/.test(message)) {
      return { type: 'tool_call', call: { id: `call-${crypto.randomUUID()}`, name: 'chapter.search', arguments: { query: queryFromMessage(message) } } }
    }
    if (/当前作品|这部作品/.test(message)) {
      return { type: 'tool_call', call: { id: `call-${crypto.randomUUID()}`, name: 'work.get_current', arguments: {} } }
    }
    const contextHint = request.context.activeChapter || request.context.activeWork ? '我知道你正停留在已授权的创作上下文里。' : '这次没有获准读取作品或章节。'
    const text = `${contextHint} 我在这里，愿意听你继续说。`
    if (!options?.signal?.aborted) options?.onTextDelta?.(text)
    return { type: 'text', text }
  }
}

class CustomCompanionModel implements AgentModelProvider {
  readonly id: 'deepseek' | 'custom'
  private readonly endpoint: string
  private readonly model: string
  constructor(id: 'deepseek' | 'custom', endpoint: string, model: string) { this.id = id; this.endpoint = endpoint; this.model = model }

  async testConnection() {
    if (this.id !== 'deepseek') throw new Error('自定义 Provider 尚未授权联网；当前只开放 DeepSeek')
    if (!this.endpoint.startsWith('https://api.deepseek.com')) throw new Error('DeepSeek 服务地址必须使用 https://api.deepseek.com')
    if (!await hasCompanionKey()) throw new Error('请先安全保存对话模型 API Key')
    await this.generate({ messages: [{ role: 'user', content: '只回复：连接正常' }], context: { page: 'settings', companion: { name: '一隅' }, localTime: { timeZone: 'Asia/Shanghai', date: '2000-01-01', time: '00:00:00', weekday: '星期六', period: '凌晨' } }, tools: [] })
    return `DeepSeek 已连接：${this.model || '未命名模型'}。`
  }

  async generate(request: AgentModelRequest, options?: { onTextDelta?: (delta: string) => void; signal?: AbortSignal }): Promise<AgentModelResponse> {
    if (this.id !== 'deepseek') throw new Error('PROVIDER_PROTOCOL_UNCONFIGURED:自定义 Provider 尚未开放联网')
    const toolNames = new Map(request.tools.map((tool) => [tool.name.replaceAll('.', '__'), tool.name]))
    const context = [
      `当前北京时间：${request.context.localTime.date} ${request.context.localTime.weekday} ${request.context.localTime.time}（${request.context.localTime.period}）`,
      `当前页面：${request.context.page}`,
      request.context.activeWork ? `当前作品：${request.context.activeWork.title}` : '',
      request.context.activeChapter ? `当前章节：${request.context.activeChapter.title}` : '',
      request.context.selection ? `当前选择：${request.context.selection.slice(0, 1200)}` : '',
      request.context.availableFeatures?.length ? `可介入功能：${request.context.availableFeatures.join('、')}` : '',
    ].filter(Boolean).join('\n')
    const messages = [
      { role: 'system', content: `以下是应用提供的受控上下文摘要，不代表额外授权：\n${context}` },
      ...request.messages.map((message) => {
        if (message.role === 'assistant' && message.toolCall) {
          return { role: 'assistant', content: null, tool_calls: [{ id: message.toolCall.id, type: 'function', function: { name: message.toolCall.name.replaceAll('.', '__'), arguments: JSON.stringify(message.toolCall.arguments) } }] }
        }
        if (message.role === 'tool') return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
        return { role: message.role, content: message.content }
      }),
    ]
    const tools = request.tools.map((tool) => ({ type: 'function', function: { name: tool.name.replaceAll('.', '__'), description: tool.description, parameters: tool.inputSchema } }))
    type StreamChunk = { done?: boolean; choices?: { delta?: { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] }
    const channel = new Channel<StreamChunk>()
    let text = ''
    const calls = new Map<number, { id: string; name: string; arguments: string }>()
    channel.onmessage = (chunk) => {
      const delta = chunk.choices?.[0]?.delta
      if (delta?.content && !options?.signal?.aborted) {
        text += delta.content
        options?.onTextDelta?.(delta.content)
      }
      delta?.tool_calls?.forEach((item) => {
        const current = calls.get(item.index) ?? { id: '', name: '', arguments: '' }
        if (item.id) current.id = item.id
        if (item.function?.name) current.name += item.function.name
        if (item.function?.arguments) current.arguments += item.function.arguments
        calls.set(item.index, current)
      })
    }
    await invoke('companion_chat_completion_stream', { endpoint: this.endpoint, model: this.model, messages, tools, onEvent: channel })
    if (options?.signal?.aborted) throw new Error('AGENT_CANCELLED:已中止本轮回答')
    const call = [...calls.entries()].sort(([left], [right]) => left - right)[0]?.[1]
    if (call) {
      let argumentsValue: unknown
      try { argumentsValue = JSON.parse(call.arguments || '{}') }
      catch { throw new Error('MODEL_TOOL_ARGUMENTS_INVALID:模型返回了无法解析的 Tool 参数') }
      return { type: 'tool_call', call: { id: call.id || `call-${crypto.randomUUID()}`, name: toolNames.get(call.name) ?? call.name.replaceAll('__', '.'), arguments: argumentsValue } }
    }
    const clean = text.trim()
    if (!clean) throw new Error('MODEL_RESPONSE_EMPTY:模型没有返回文本或 Tool Call')
    return { type: 'text', text: clean }
  }
}

export function createCompanionProvider(config: { providerId: 'mock' | 'deepseek' | 'custom'; endpoint: string; model: string }): AgentModelProvider {
  return config.providerId === 'mock' ? new MockCompanionModel() : new CustomCompanionModel(config.providerId, config.endpoint, config.model)
}

export async function storeCompanionKey(secret: string) {
  if (isTauriRuntime()) await invoke('store_secret', { id: companionSecretId, secret })
  else sessionStorage.setItem('yiyu.companion.key', secret)
}

export async function deleteCompanionKey() {
  if (isTauriRuntime()) await invoke('delete_secret', { id: companionSecretId })
  else sessionStorage.removeItem('yiyu.companion.key')
}

export async function hasCompanionKey() {
  return isTauriRuntime() ? invoke<boolean>('has_secret', { id: companionSecretId }) : Boolean(sessionStorage.getItem('yiyu.companion.key'))
}
