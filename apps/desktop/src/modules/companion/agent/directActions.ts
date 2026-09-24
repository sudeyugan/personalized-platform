import type { AgentToolCall, AgentToolDefinition } from './types'

const explicitOpenIntent = /^(?:(?:小鱼|你)[，,\s]*)?(?:(?:请|麻烦|帮我|替我|给我|试着|尝试)[，,\s]*)*(?:在(?:默认)?浏览器(?:里|中)?[，,\s]*)?(?:打开|访问|进入)[，,\s]*(?:一下[，,\s]*)?(?:这个[，,\s]*)?(?:网页|网站|链接)?[：:\s]*/i
const webTarget = /https:\/\/[^\s，。！？；;]+|(?:www\.)?[a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,24}(?::\d{2,5})?(?:\/[^\s，。！？；;]*)?/i

export function resolveDirectAction(message: string, tools: AgentToolDefinition[]): AgentToolCall | undefined {
  if (!tools.some((tool) => tool.name === 'system.open')) return undefined
  const normalizedMessage = message.trim()
  const match = explicitOpenIntent.exec(normalizedMessage)
  if (!match) return undefined
  const targetMatch = normalizedMessage.slice(match[0].length).match(webTarget)
  if (!targetMatch) return undefined
  const target = targetMatch[0].startsWith('https://') ? targetMatch[0] : `https://${targetMatch[0]}`
  return { id: `direct-${crypto.randomUUID()}`, name: 'system.open', arguments: { target } }
}