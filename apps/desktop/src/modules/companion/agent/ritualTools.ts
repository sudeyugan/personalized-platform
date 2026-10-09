import type { FortuneKind } from '../../../domain/fortune'
import type { AgentTool } from './toolRegistry'
import type { AgentToolResult } from './types'

export interface LocalRitualResult { text: string; kind?: FortuneKind; date?: string; signId?: number; reused?: boolean; guest?: boolean }
export interface AgentRitualServices {
  drawFortune?(kind: FortuneKind, guest: boolean): LocalRitualResult
  drawTruth?(): LocalRitualResult
  drawAnswerBook?(): LocalRitualResult
}
export const localRitualTools = new Set(['fortune.draw', 'truth.draw', 'answer_book.draw'])
export function localRitualReply(result: AgentToolResult) {
  if (!result.success) return `这次没有抽取成功：${result.error?.message ?? '本地操作失败'}。`
  const data = result.data as LocalRitualResult | undefined
  return data?.text || '本地抽取结果无法读取，请到对应页面查看。'
}
export function createRitualTools(): AgentTool[] {
  return [
    {
      definition: {
        name: 'fortune.draw', description: '实际抽取本地今日签、恋爱签或前程签；个人签各筒每天一支，重复请求返回同一结果。guest=true为临时客签，不占每日签。非现实预测。',
        inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['daily', 'love', 'future'] }, guest: { type: 'boolean' } }, additionalProperties: false }, capability: 'modify', risk: 'low', scope: 'fortune',
      },
      execute: (args, services) => {
        if (!services.drawFortune) throw new Error('本地抽签动作未接入')
        return services.drawFortune((args.kind ?? 'daily') as FortuneKind, args.guest === true)
      },
    },
    {
      definition: { name: 'truth.draw', description: '从应用原创真心话题库实际抽一张卡；只返回题目，不收集或保存回答。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, capability: 'presentation', risk: 'low', scope: 'truth' },
      execute: (_args, services) => {
        if (!services.drawTruth) throw new Error('本地真心话抽卡动作未接入')
        return services.drawTruth()
      },
    },
    {
      definition: { name: 'answer_book.draw', description: '翻开本地答案之书，从应用原有答案库随机取一句，在聊天中呈现；不分析问题、不自动收藏。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, capability: 'presentation', risk: 'low', scope: 'answer_book' },
      execute: (_args, services) => {
        if (!services.drawAnswerBook) throw new Error('本地答案之书翻页动作未接入')
        return services.drawAnswerBook()
      },
    },
  ]
}
