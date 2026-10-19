import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { sendCompanionTurn } from './companionConversation'
import { setPrivateConversation } from './conversationPrivacy'
import { inConversationLane } from './conversationLane'
import { projectLibrary } from '../device-sync/libraryProjection'
import type { AgentModelRequest, AgentModelResponse } from './agent/types'
const generate = vi.hoisted(() => vi.fn(async (_request: AgentModelRequest): Promise<AgentModelResponse> => ({ type: 'text', text: '普通的问候' })))
vi.mock('../../infrastructure/companionProvider', () => ({ createCompanionProvider: () => ({ id: 'test', generate, testConnection: async () => 'ok' }) }))
vi.mock('../../state/persistence', () => ({ commitLibraryData: (data: unknown, set: (value: unknown) => void) => set({ data }), queueLibrarySave: vi.fn() }))
beforeEach(() => {
  localStorage.clear(); generate.mockClear()
  const data = createSeedLibrary()
  data.settings.trust.retainConversationHistory = true
  data.settings.trust.shareRecentConversation = true
  data.chapters[data.session.activeChapterId].plainText = 'LOCAL-DOC-CONTENT'
  data.companion.messages = [{ id: 'private', role: 'user', content: 'LOCAL-PRIVATE-HISTORY', createdAt: '2026-10-19T01:00:00Z', syncScope: 'local' }]
  useLibraryStore.setState({ data, temporaryCompanionWorkIds: [] })
})
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
describe('ordinary PC chat privacy and immediate feedback', () => {
  it('blocks secret input in ordinary mode before provider or shared/local pending storage', async () => {
    setPrivateConversation(false)
    await expect(sendCompanionTurn('api_key=abcdefghijk123456789')).rejects.toThrow('密钥')
    expect(generate).not.toHaveBeenCalled()
    expect(useLibraryStore.getState().data.companion.messages).toHaveLength(1)
  })
  it('shows a local pending user bubble, then shares only a pure-chat pair without local context', async () => {
    setPrivateConversation(false)
    generate.mockImplementationOnce(async request => {
      const pending = useLibraryStore.getState().data.companion.messages.at(-1)!
      expect(pending.syncScope).toBe('ordinary-local'); expect(inConversationLane(pending, false)).toBe(true)
      expect(projectLibrary(useLibraryStore.getState().data)).not.toHaveProperty('chat/' + pending.id)
      expect(JSON.stringify(request)).not.toContain('LOCAL-PRIVATE-HISTORY')
      expect(JSON.stringify(request.messages)).not.toContain('LOCAL-DOC-CONTENT')
      return { type: 'text', text: '普通的问候' }
    })
    await sendCompanionTurn('你好呀')
    const data = useLibraryStore.getState().data
    expect(data.companion.messages.filter(message => message.syncScope === 'shared')).toHaveLength(2)
    expect(Object.keys(projectLibrary(data)).filter(key => key.startsWith('chat/'))).toHaveLength(2)
    expect(data.companion.messages[0].syncScope).toBe('local')
  })
  it('does not share a local tool turn, but keeps it visible in its originating lane', async () => {
    setPrivateConversation(false)
    await sendCompanionTurn('抽一根签')
    const data = useLibraryStore.getState().data
    expect(Object.keys(projectLibrary(data)).some(key => key.startsWith('chat/'))).toBe(false)
    const turns = data.companion.messages.slice(1)
    expect(turns.length).toBeGreaterThan(0)
    expect(turns.every(message => inConversationLane(message, false) && !inConversationLane(message, true))).toBe(true)
  })
  it('upserts a pending message and clears only the chosen conversation lane', () => {
    const store = useLibraryStore.getState(), now = new Date().toISOString()
    store.addCompanionMessage({ id: 'one', role: 'user', content: 'pending', createdAt: now, syncScope: 'ordinary-local' })
    store.addCompanionMessage({ id: 'one', role: 'user', content: 'pending', createdAt: now, syncScope: 'shared' })
    expect(useLibraryStore.getState().data.companion.messages.filter(message => message.id === 'one')).toHaveLength(1)
    store.clearCompanionMessages('local')
    expect(useLibraryStore.getState().data.companion.messages.map(message => message.id)).toEqual(['one'])
    store.addCompanionMessage({ id: 'another-private', role: 'user', content: 'local', createdAt: now })
    store.clearCompanionMessages('ordinary')
    expect(useLibraryStore.getState().data.companion.messages.map(message => message.id)).toEqual(['another-private'])
  })
})
