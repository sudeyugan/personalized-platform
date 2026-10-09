import { DEFAULT_COMPANION_NAME, stripCompanionAddress } from '../../../domain/companionIdentity'
import type { AgentToolCall, AgentToolDefinition } from './types'
import { resolveRitualAction } from './ritualIntent'

export interface AgentActionIntent {
  expectsTool: boolean
  directCall?: AgentToolCall
  requiresTaskPlan?: boolean
}

const explicitOpenIntent = /^(?:你[，,\s]*)?(?:(?:请|麻烦|帮我|替我|给我|试着|尝试)[，,\s]*)*(?:在(?:默认)?浏览器(?:里|中)?[，,\s]*)?(?:打开|访问|进入)[，,\s]*(?:一下[，,\s]*)?(?:这个[，,\s]*)?(?:网页|网站|链接)?[：:\s]*/i
const webTarget = /https:\/\/[^\s，。！？；;]+|(?:www\.)?[a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,24}(?::\d{2,5})?(?:\/[^\s，。！？；;]*)?/i
const discussionPrefix = /^(?:为什么|为何|怎么|如何|是否|能否|可不可以|可以吗|介绍|解释|说明|讨论|假如|如果|不要|别|无需|不用)/
const actionVerb = /^(?:你[，,\s]*)?(?:(?:请|麻烦|帮我|替我|给我(?:的)?|试着|尝试|我想让你)[，,\s]*)*(?:把[^，。！？]{0,40})?(?:打开|访问|进入|跳转|切换到|创建|新增|添加|修改|改写|重命名|记录|保存|删除|移除|开始录屏|停止录屏|录制屏幕|录(?:个|制)?视频|截图|截屏|读取剪贴板|查看剪贴板|写入剪贴板|复制到剪贴板|播放音乐|暂停音乐|上一首|下一首|聚焦窗口|关闭窗口|移动窗口|输入文字|点击|运行程序|停止程序|发送通知)/
const narratedRecording = /(?:录(?:个|制)?视频|录屏).*(?:介绍|讲解|演示)|(?:介绍|讲解|演示).*(?:录(?:个|制)?视频|录屏)|(?:\d+|[一二三四五六七八九十百]+)\s*秒(?:钟)?(?:的)?视频(?:来)?(?:介绍|讲解|演示)/

function hasTool(tools: AgentToolDefinition[], name: string) {
  return tools.some((tool) => tool.name === name)
}

function call(name: string, args: Record<string, unknown>): AgentToolCall {
  return { id: `direct-${crypto.randomUUID()}`, name, arguments: args }
}

function resolveWebOpen(message: string, tools: AgentToolDefinition[]) {
  if (!hasTool(tools, 'system.open')) return undefined
  const match = explicitOpenIntent.exec(message)
  if (!match) return undefined
  const targetMatch = message.slice(match[0].length).match(webTarget)
  if (!targetMatch) return undefined
  const target = targetMatch[0].startsWith('https://') ? targetMatch[0] : `https://${targetMatch[0]}`
  return call('system.open', { target })
}

const pageRoutes: Array<{ pattern: RegExp; destination: string; extras?: Record<string, unknown> }> = [
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:本月|月度).*(?:情绪回望|情绪统计)/, destination: 'mood.reflection', extras: { range: 'month' } },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:本周|周度).*(?:情绪回望|情绪统计)/, destination: 'mood.reflection', extras: { range: 'week' } },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:情绪回望|情绪统计)/, destination: 'mood.reflection' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:课表|课程表)/, destination: 'calendar.schedule' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:日历|事务)/, destination: 'calendar.day' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:待办|TODO|任务清单)/i, destination: 'todos' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:日记)/, destination: 'diary.day' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:创作空间|写作)/, destination: 'writing.chapter' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:人物)/, destination: 'record.person' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:地点)/, destination: 'record.place' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:时间线)/, destination: 'record.timeline' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:经历册)/, destination: 'experiences' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:抽签|每日一签)/, destination: 'fortune' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:真心话)/, destination: 'truth' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:素材库)/, destination: 'assets' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:答案之书)/, destination: 'answer_book' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:音乐)/, destination: 'music' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:帮助中心|帮助)/, destination: 'help' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:设置)/, destination: 'settings' },
  { pattern: /^(?:打开|进入|跳转到|切换到).*(?:首页|主页)/, destination: 'home' },
]

function resolveKnownAction(message: string, tools: AgentToolDefinition[]) {
  const command = message.replace(/^(?:你[，,\s]*)?(?:(?:请|麻烦|帮我|替我|给我(?:的)?|试着|尝试)[，,\s]*)*/, '')
  if (hasTool(tools, 'app.open')) {
    const page = pageRoutes.find((route) => route.pattern.test(command))
    if (page) return call('app.open', { destination: page.destination, ...page.extras })
  }
  if (hasTool(tools, 'music.control')) {
    if (/^(?:请|帮我|给我)?[，,\s]*播放(?:一下)?音乐/.test(command)) return call('music.control', { action: 'play' })
    if (/^(?:请|帮我|给我)?[，,\s]*暂停(?:一下)?音乐/.test(command)) return call('music.control', { action: 'pause' })
    if (/^(?:请|帮我|给我)?[，,\s]*(?:切到|播放)?上一首/.test(command)) return call('music.control', { action: 'previous' })
    if (/^(?:请|帮我|给我)?[，,\s]*(?:切到|播放)?下一首/.test(command)) return call('music.control', { action: 'next' })
  }
  if (hasTool(tools, 'clipboard.read') && /^(?:请|帮我)?[，,\s]*(?:读取|查看|看看|告诉我)(?:一下)?(?:当前)?剪贴板/.test(command)) return call('clipboard.read', {})
  if (hasTool(tools, 'screen.capture') && /^(?:请|帮我)?[，,\s]*(?:截图|截屏|截取全屏)/.test(command)) return call('screen.capture', { source: 'desktop' })
  if (hasTool(tools, 'screen.record_start') && /^(?:请|帮我)?[，,\s]*(?:开始录屏|录制屏幕|开始录制屏幕)/.test(command)) return call('screen.record_start', { source: 'desktop' })
  if (hasTool(tools, 'screen.record_status') && /^(?:请|帮我)?[，,\s]*(?:查看|检查|告诉我)(?:一下)?(?:当前)?录屏状态/.test(command)) return call('screen.record_status', {})
  return undefined
}

export function detectActionIntent(message: string, tools: AgentToolDefinition[], name = DEFAULT_COMPANION_NAME): AgentActionIntent {
  const normalized = stripCompanionAddress(message, name)
  if (!normalized || discussionPrefix.test(normalized)) return { expectsTool: false }
  const directCall = resolveRitualAction(normalized, tools) ?? resolveWebOpen(normalized, tools) ?? resolveKnownAction(normalized, tools)
  const requiresTaskPlan = hasTool(tools, 'task.create') && narratedRecording.test(normalized)
  return { expectsTool: requiresTaskPlan || Boolean(directCall) || actionVerb.test(normalized), directCall, ...(requiresTaskPlan ? { requiresTaskPlan: true } : {}) }
}

export function resolveDirectAction(message: string, tools: AgentToolDefinition[], name = DEFAULT_COMPANION_NAME): AgentToolCall | undefined {
  return detectActionIntent(message, tools, name).directCall
}
