import { useLibraryStore } from '../../state/useLibraryStore'
import { operationDraftOf } from '../../domain/operations/catalog'
import { resolveOperation, methodInstruction } from '../../domain/operations/method'
import type { OperationSelection } from '../../domain/operations/types'
import type { AgentAuditRecord, AgentSession } from '../companion/agent/types'
import { assertExternalAiAllowed } from '../trust/trustPolicy'
import { assertOperationAccess } from './services'
import { learnSuccessfulOperation } from './automaticLearning'

export const operationTrainingEvent = 'yiyu:operation-training'
export function prepareOperationTurn(selection: OperationSelection) {
  assertOperationAccess()
  const data = useLibraryStore.getState().data
  const item = data.companion.operations?.find(item => item.id === selection.id)
  if (!item) throw new Error('方法已删除，请重新选择')
  const method = resolveOperation(item, selection)
  if (method.scope === 'window') throw new Error('窗口方法需要在接管面板选择窗口并确认本次外发')
  const identity = JSON.stringify({ provider: data.companion.provider, trust: data.settings.trust })
  return { scope: method.scope, goal: method.goal, message: methodInstruction(method), assertAllowed() {
    assertOperationAccess()
    const live = useLibraryStore.getState().data
    const current = live.companion.operations?.find(item => item.id === selection.id)
    if (!current || !current.enabled || current.revision !== selection.revision) throw new Error('方法已改变或停用，当前执行已停止')
    if (JSON.stringify({ provider: live.companion.provider, trust: live.settings.trust }) !== identity) throw new Error('模型或隐私设置已改变，请重新确认')
    assertExternalAiAllowed(live.companion.provider.providerId, live.settings.trust, 'companion')
  } }
}
export function finishOperationTurn(result: { audit: AgentAuditRecord[] }, receipt?: (status: 'awaiting_review' | 'handoff' | 'error', count: number) => void) {
  const count = result.audit.filter(item => !item.toolName.startsWith('operation.') && item.toolName !== 'app.capabilities').length
  receipt?.(result.audit.some(item => item.resultStatus === 'error') ? 'error' : count ? 'awaiting_review' : 'handoff', count)
}
/** Deliberately never capture arguments, result text, UI text or evidence. */
export function offerOperationTraining(message: string, result: { audit: AgentAuditRecord[]; session: AgentSession }) {
  const learned = learnSuccessfulOperation(message, result)
  if (learned) window.dispatchEvent(new CustomEvent(operationTrainingEvent, { detail: { learnedTitle: learned.title } }))
}
export function copyOperationMethod(id: string) { const item = useLibraryStore.getState().data.companion.operations?.find(item => item.id === id); return item ? operationDraftOf(item) : undefined }
