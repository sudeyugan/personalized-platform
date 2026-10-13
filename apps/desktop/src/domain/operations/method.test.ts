import { describe, expect, it } from 'vitest'
import { validateOperationDraft, operationParameters, resolveOperation } from './method'
import { matchOperations, normalizeOperations } from './catalog'
import { method, learned } from './fixtures'
describe('generic operation methods', () => {
  it('detects unique parameters across all instructions and resolves fresh values', () => {
    expect(operationParameters(method)).toEqual(['关键词'])
    expect(resolveOperation(learned(), { id: 'operation-test', revision: 1, parameters: { 关键词: '新资料' } })).toMatchObject({ goal: '查询 新资料 的当前信息', steps: ['搜索 新资料', '从当前结果读取官方来源，并核对 新资料 身份'] })
  })
  it.each<Record<string, string>>([{}, { 关键词: '' }, { 关键词: '资料', 多余: '值' }])('requires exact parameter values (%j)', parameters => expect(() => resolveOperation(learned(), { id: 'operation-test', revision: 1, parameters })).toThrow())
  it.each([{ enabled: false }, { revision: 2 }, { id: 'operation-other' }])('invalidates a changed/disabled/wrong method (%j)', changes => expect(() => resolveOperation(learned(changes), { id: 'operation-test', revision: 1, parameters: { 关键词: '资料' } })).toThrow())
  it.each(['{{}}', '{{空 格}}', '{{关键词', '{{password}}', '{{密码}}', '{{token}}'])('rejects malformed or credential parameter %s', goal => expect(() => validateOperationDraft({ ...method, goal })).toThrow())
  it.each(['password=real-password', 'Cookie: session-secret', '密码：秘密文字', 'Bearer abcdefghijklmn', 'https://user:pass@example.com/', 'https://example.com/?access_token=private'])('does not store credential content %s', goal => expect(() => validateOperationDraft({ ...method, goal })).toThrow())
  it.each([{ steps: [] }, { steps: Array(9).fill('步骤') }, { result: 'private output' }, { executor: 'shell' }, { x: 100, y: 200 }, { keywords: Array(9).fill('查') }])('rejects invalid shape and captured results (%j)', changes => expect(() => validateOperationDraft({ ...method, ...changes })).toThrow())
  it('does not merge ambiguous candidates or include disabled methods', () => {
    expect(matchOperations([learned(), learned({ id: 'operation-other', title: '查询另一份公开信息' }), learned({ id: 'operation-off', enabled: false })], '帮我查资料')).toHaveLength(2)
    expect(matchOperations([learned()], '')).toEqual([])
    expect(matchOperations([learned()], '播放音乐')).toEqual([])
  })
  it('normalizes old/corrupt methods and strips unknown persistent data', () => {
    expect(normalizeOperations(undefined)).toEqual([])
    const restored = normalizeOperations([learned(), learned(), learned({ id: 'bad' }), learned({ id: 'operation-with-raw', runs: [{ id: 'operation-run-1', revision: 1, at: '2026-10-12T00:00:00Z', status: 'awaiting_review', reason: 'review', toolCount: 1, rawText: 'private output' } as never] })])
    expect(restored).toHaveLength(2)
    expect(JSON.stringify(restored)).not.toContain('private output')
  })
})
