import { operationDraftOf } from '../../domain/operations/catalog'
import { validateOperationDraft, methodInstruction } from '../../domain/operations/method'
import { validOperationPattern } from '../../domain/operations/learning'
import type { LearnedOperation } from '../../domain/operations/types'
import type { OperationServices } from './services'
import { browserObjective } from '../browser-connection/taskGoal'
export function automaticMethodHint(message: string, candidates: unknown[], services: OperationServices) {
  if (/^(?:为什么|如何|怎么实现|介绍|解释|讨论|假如|如果|不要|别)/u.test(message.trim()) || candidates.length !== 1) return
  const candidate = candidates[0] as { id?: string }
  if (!candidate.id) return
  const current = services.getOperation?.(candidate.id) as LearnedOperation | undefined
  if (!current || !validOperationPattern(current.pattern) || current.scope === 'window') return
  if (current.pattern.includes('browser.followed_live') && browserObjective(message) !== 'followed_live') return
  const draft = validateOperationDraft(operationDraftOf(current))
  return { id: current.id, scope: current.scope, instruction: `${methodInstruction(draft)}\n这是此前成功工具流程自动整理的经验。目标以用户本次消息为准，变化参数从本次请求或本轮结果取得；不要为了普通读取要求填写方法表单，也不要无证据宣称已完成。`, assertCurrent() {
    const live = services.getOperation?.(current.id) as LearnedOperation | undefined
    if (!live || live.id !== current.id || live.revision !== current.revision) throw new Error('复用的方法已编辑、停用或删除，本轮已停止')
  } }
}
