import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { learned } from '../../domain/operations/fixtures'
import { sendCompanionTurn } from '../companion/companionConversation'
import { useLibraryStore } from '../../state/useLibraryStore'
import type { AgentModelRequest, AgentModelResponse } from '../companion/agent/types'

const calls = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('../../infrastructure/companionProvider', () => ({ createCompanionProvider: () => ({ id: 'mock', generate: calls.generate, testConnection: async () => '' }) }))
vi.mock('../privacy', () => ({ createPrivacyProtectedProvider: (provider: unknown) => provider, protectOutboundText: async (text: string) => text }))
vi.mock('../../infrastructure/libraryRepository', () => ({ libraryRepository: { save: vi.fn().mockResolvedValue(undefined) } }))
beforeEach(() => {
  calls.generate.mockReset()
  const data = createSeedLibrary(); data.companion.operations = [learned({ scope: 'application', goal: '检查当前待办', steps: ['读取当前待办并按实际状态整理'] })]
  data.companion.messages = [{ id: 'private-old', content: 'PRIVATE-OLD-HISTORY', role: 'user', createdAt: new Date().toISOString(), contextSummary: '' }]
  data.settings.trust.retainConversationHistory = true
  useLibraryStore.setState({ data })
})
describe('actual companion turn method integration', () => {
  it('uses live app tools, excludes old context and does not persist the result as chat', async () => {
    calls.generate.mockResolvedValueOnce({ type: 'tool_call', call: { id: 'op-list', name: 'todo.list', arguments: { status: 'pending' } } } as AgentModelResponse).mockResolvedValueOnce({ type: 'text', text: JSON.stringify({ version: 1, blocks: [{ type: 'paragraph', text: 'PRIVATE-CURRENT-RESULT' }] }) } as AgentModelResponse)
    const receipt = vi.fn()
    const result = await sendCompanionTurn('', { operation: { id: 'operation-test', revision: 1, parameters: {} }, onOperationReceipt: receipt })
    expect(result).toContain('PRIVATE-CURRENT-RESULT')
    const request = calls.generate.mock.calls[0][0] as AgentModelRequest
    expect(request.context.activeWork).toBeUndefined(); expect(request.context.activeChapter).toBeUndefined()
    expect(JSON.stringify(request.messages)).not.toContain('PRIVATE-OLD-HISTORY')
    expect(request.tools?.some(tool => tool.name === 'todo.list')).toBe(true)
    expect(receipt).toHaveBeenLastCalledWith('awaiting_review', 1)
    expect(useLibraryStore.getState().data.companion.messages).toHaveLength(1)
    expect(JSON.stringify(useLibraryStore.getState().data.companion.operations)).not.toContain('PRIVATE-CURRENT-RESULT')
  })
  it('ignores a revoked method before forwarding a late model action', async () => {
    calls.generate.mockImplementation(async (): Promise<AgentModelResponse> => { useLibraryStore.getState().data.companion.operations![0].enabled = false; return { type: 'tool_call', call: { id: 'late', name: 'todo.create', arguments: { title: '不能写入' } } } })
    const before = useLibraryStore.getState().data.planner.todos.length
    await expect(sendCompanionTurn('', { operation: { id: 'operation-test', revision: 1, parameters: {} } })).rejects.toThrow('已改变或停用')
    expect(useLibraryStore.getState().data.planner.todos).toHaveLength(before)
  })
})
