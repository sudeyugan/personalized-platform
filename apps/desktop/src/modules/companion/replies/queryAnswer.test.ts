import { describe, expect, it } from 'vitest'
import { ReplySession } from './session'
import { canSynthesize, composeQueryAnswer, queryAnswerInstruction, validQueryAnswer } from './queryAnswer'
import type { ToolReceipt } from './types'

const answer = (text: string, sourceIds: string[] = []) => JSON.stringify({ version: 1, blocks: [{ type: 'paragraph', text }], sourceIds })
function search(): ToolReceipt {
  return { call: { id: 'search', name: 'web.search', arguments: { query: '北京 2026-10-19 降雨预报' } }, result: { success: true, data: Array.from({ length: 9 }, (_, i) => ({ title: `结果${i}`, snippet: '导航 旧新闻 一长串无关内容', url: `https://example.com/${i}` })) } }
}
const failed: ToolReceipt = { call: { id: 'page', name: 'web.read_page', arguments: {} }, result: { success: false, error: { code: 'ExecutionFailed', message: '目标来源暂时不可用' } } }

describe('answer-first query presentation', () => {
  it('answers a simple weather follow-up without nine search snippets or an execution heading', () => {
    const value = composeQueryAnswer([search()], answer('北京明天有雨，出门记得带伞。', ['s2']))
    expect(value).toMatch(/^北京明天有雨/)
    expect(value).toContain('https://example.com/1')
    expect(value).not.toMatch(/本次执行结果|分析说明|导航|旧新闻|结果0|结果2/)
  })
  it('integrates multiple sources once and caps program-owned source links', () => {
    const page: ToolReceipt = { call: { id: 'p', name: 'web.read_page', arguments: {} }, result: { success: true, data: { url: 'https://official.example.com/forecast', title: '官方预报', text: 'RAW-ENTIRE-PAGE', cached: true, truncated: true } } }
    const value = composeQueryAnswer([search(), page], answer('两地都可能下雨，第一天优先安排室内活动。', ['s1', 's3']))
    expect(value).toMatch(/^两地都可能下雨/)
    expect(value).toContain('official.example.com/forecast')
    expect(value).toContain('缓存结果'); expect(value).toContain('不完整')
    expect(value).not.toContain('RAW-ENTIRE-PAGE')
    expect(value.match(/\]\(https/g)).toHaveLength(2)
  })
  it('does not let model summaries erase failed reads or turn all failures into a positive answer', () => {
    expect(composeQueryAnswer([search(), failed], answer('目前证据不足以确认。'))).toContain('目标来源暂时不可用')
    const value = composeQueryAnswer([failed], answer('明天一定会下雨。'))
    expect(value).toContain('无法确认查询结论'); expect(value).not.toContain('一定会下雨')
  })
  it('rejects unknown source IDs, URLs and empty envelopes', () => {
    expect(validQueryAnswer([search()], answer('有雨。', ['s99']))).toBeUndefined()
    expect(validQueryAnswer([search()], answer('来源 https://evil.invalid'))).toBeUndefined()
    expect(validQueryAnswer([search()], '{"version":1,"blocks":[]}')).toBeUndefined()
    expect(queryAnswerInstruction([search()])).toContain('"s1"')
    expect(queryAnswerInstruction([search()])).toContain('不限制中途工具调用')
    expect(queryAnswerInstruction([search()])).not.toContain('一长串无关内容')
  })
  it('stops compactly on provider failure, never substituting a raw result dump for an answer', () => {
    const session = new ReplySession(); session.accept(search())
    const value = session.stopped('模型暂时不可用')
    expect(value).toContain('还没能')
    expect(value).toContain('模型暂时不可用'); expect(value).not.toMatch(/导航|旧新闻|本次返回 9 项/)
    expect(value.match(/\]\(https/g)).toHaveLength(2)
  })
  it('keeps browser evidence and write receipts out of synthesis', () => {
    for (const name of ['browser.observe', 'browser.read_content', 'browser.verify', 'todo.create', 'fortune.draw']) {
      const entry: ToolReceipt = { call: { id: name, name, arguments: {} }, result: { success: true, data: {} } }
      expect(canSynthesize([search(), entry])).toBe(false)
      expect(queryAnswerInstruction([entry])).toBeUndefined()
    }
  })
  it('can answer an authoritative empty local list without treating empty web search as a negative fact', () => {
    const entry: ToolReceipt = { call: { id: 'todos', name: 'todo.list', arguments: {} }, result: { success: true, data: [] }, definition: { name: 'todo.list', description: '待办', capability: 'read', risk: 'read_only', scope: 'none', inputSchema: { type: 'object', properties: {} } } }
    expect(composeQueryAnswer([entry], answer('今天没有待办。'))).toMatch(/^今天没有待办/)
    expect(composeQueryAnswer([{ ...search(), result: { success: true, data: [] } }], answer('明天不会下雨。'))).not.toContain('明天不会下雨')
  })
})
