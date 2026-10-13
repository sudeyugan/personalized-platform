import type { AgentToolCall, AgentToolDefinition, AgentToolResult } from '../agent/types'

export type ReplyState = 'completed' | 'pending' | 'partial' | 'empty' | 'failed' | 'cancelled' | 'unknown'
export interface ReplyLink { label: string; url: string }
export interface ReplyItem { title: string; detail?: string; link?: ReplyLink }
export type ReplyBlock = { type: 'text'; text: string } | { type: 'list'; items: ReplyItem[] } | { type: 'code'; text: string }
export interface ReplyDocument { state: ReplyState; title: string; blocks: ReplyBlock[]; notes: string[] }
export interface ToolReceipt { call: AgentToolCall; result: AgentToolResult; definition?: AgentToolDefinition }
export const replyStateLabels: Record<ReplyState, string> = {
  completed: '已完成', pending: '等待后续', partial: '部分结果', empty: '未找到', failed: '未完成', cancelled: '已取消', unknown: '尚未确认',
}
