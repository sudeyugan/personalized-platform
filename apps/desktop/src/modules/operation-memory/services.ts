import { useLibraryStore } from '../../state/useLibraryStore'
import { moduleStatus } from '../../domain/moduleAvailability'
import { validateOperationDraft } from '../../domain/operations/method'
import type { OperationDraft } from '../../domain/operations/types'
import { openOperationMemory } from './events'

export interface OperationServices {
  findOperations?(query: string): unknown[]
  getOperation?(id: string): unknown
  prepareOperation?(id: string, revision: number): unknown
  proposeOperation?(draft: OperationDraft): unknown
}
export function assertOperationAccess() {
  const data = useLibraryStore.getState().data
  const module = moduleStatus(data.settings.modules, 'companion')
  if (!module.enabled || !module.available) throw new Error('AI伙伴模块已关闭')
  if (!data.companion.permissions.fullAccess && !data.companion.permissions.memories) throw new Error('操作记忆未授权，请开启伙伴记忆权限')
}
export function createOperationServices(): OperationServices {
  return {
    prepareOperation(id, revision) {
      assertOperationAccess()
      const current = useLibraryStore.getState().data.companion.operations?.find(item => item.id === id && item.enabled && item.revision === revision)
      if (!current) throw new Error('方法已修改、停用或删除，请重新查找')
      openOperationMemory({ mode: 'run', id, revision })
      return { prepared: true, executed: false, title: current.title }
    },
    proposeOperation(draft) {
      assertOperationAccess()
      openOperationMemory({ mode: 'edit', draft: validateOperationDraft(draft) })
      return { prepared: true, saved: false, requiresUserReview: true }
    },
  }
}
