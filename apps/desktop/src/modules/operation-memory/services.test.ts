import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { learned, method } from '../../domain/operations/fixtures'
import { createOperationServices } from './services'
import { operationMemoryEvent } from './events'
import { prepareOperationTurn, offerOperationTraining, operationTrainingEvent, finishOperationTurn } from './turn'
import type { AgentAuditRecord, AgentSession } from '../companion/agent/types'

describe('live operation services and private output isolation', () => {
  beforeEach(() => { const data = createSeedLibrary(); data.companion.operations = [learned()]; useLibraryStore.setState({ data }) })
  it('opens an explicit panel without changing grants, results or storage', () => {
    const listener = vi.fn(); window.addEventListener(operationMemoryEvent, listener)
    const old = useLibraryStore.getState().data
    expect(createOperationServices().prepareOperation!('operation-test', 1)).toMatchObject({ executed: false })
    expect(listener).toHaveBeenCalledOnce(); expect(useLibraryStore.getState().data).toBe(old)
    window.removeEventListener(operationMemoryEvent, listener)
  })
  it('rejects stale prepare, permission revocation and credential proposals', () => {
    expect(() => createOperationServices().prepareOperation!('operation-test', 2)).toThrow()
    expect(() => createOperationServices().proposeOperation!({ ...method, goal: 'password=private-password' })).toThrow()
    const data = useLibraryStore.getState().data; data.companion.permissions.fullAccess = false; data.companion.permissions.memories = false
    expect(() => createOperationServices().prepareOperation!('operation-test', 1)).toThrow()
  })
  it('binds method and cloud authority for the whole execution', () => {
    const turn = prepareOperationTurn({ id: 'operation-test', revision: 1, parameters: { 关键词: '数据' } })
    expect(turn.message).toContain('查询 数据 的当前信息')
    turn.assertAllowed()
    useLibraryStore.getState().data.companion.operations![0].enabled = false
    expect(turn.assertAllowed).toThrow()
  })
  it('does not count a text-only answer as a completed operation', () => {
    const receipt = vi.fn(); finishOperationTurn({ audit: [] }, receipt)
    expect(receipt).toHaveBeenCalledWith('handoff', 0)
  })
  it('does not learn from an audit plus model prose without actual successful tool results', () => {
    const listener = vi.fn(); window.addEventListener(operationTrainingEvent, listener)
    const audit = [{ toolName: 'web.read_page', resultStatus: 'success', arguments: { url: 'private-secret' } }] as unknown as AgentAuditRecord[]
    offerOperationTraining('查询公开信息', { audit, session: { events: [{ type: 'assistant', content: 'private-result' }] } as unknown as AgentSession })
    expect(listener).not.toHaveBeenCalled()
    expect(useLibraryStore.getState().data.companion.operations).toHaveLength(1)
    window.removeEventListener(operationTrainingEvent, listener)
  })
})
