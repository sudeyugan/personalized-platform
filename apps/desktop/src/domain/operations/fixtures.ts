/** Fictional data used only by tests. */
import type { LearnedOperation, OperationDraft } from './types'
export const method: OperationDraft = { title: '查询公开资料', goal: '查询 {{关键词}} 的当前信息', scope: 'public_web', applicability: '公开网页与公开JSON，不使用账号', keywords: ['查资料', '公开信息'], preconditions: '核对名称与来源', steps: ['搜索 {{关键词}}', '从当前结果读取官方来源，并核对 {{关键词}} 身份'], completion: '返回最新证据、来源与获取时间；未知不作否定结论', recovery: '失败说明原因，不能推测结果' }
export const learned = (changes: Partial<LearnedOperation> = {}): LearnedOperation => ({ ...method, id: 'operation-test', revision: 1, enabled: true, createdAt: '2026-10-12T00:00:00Z', updatedAt: '2026-10-12T00:00:00Z', runs: [], ...changes })
