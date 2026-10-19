import { describe, expect, it } from 'vitest'
import { validateRecords } from '@yiyu/sync'
import { sharedConversations, mergeConversations } from './conversationProjection'
import { createSeedLibrary } from '../../domain/seed'
import { projectLibrary, mergeLibrary } from './libraryProjection'
import type { CompanionMessage } from '../../domain/models'
const item: CompanionMessage = {
  id: 'message-test',
  role: 'user',
  content: '一句普通问候',
  createdAt: '2026-10-19T01:00:00Z',
  contextSummary: '私人上下文',
}
describe('explicit conversation sharing', () => {
  it('never retrospectively shares legacy, private or browser/tool-only messages', () => {
    expect(
      sharedConversations([
        item,
        { ...item, id: 'local', syncScope: 'local' },
        { ...item, id: 'tool', localOnly: true, syncScope: 'shared' },
      ]),
    ).toEqual([])
    expect(sharedConversations([{ ...item, syncScope: 'shared' }])).toEqual([
      {
        id: item.id,
        role: item.role,
        content: item.content,
        createdAt: item.createdAt,
        scope: 'shared',
      },
    ])
  })
  it('keeps private messages when shared ones are removed and protects private ID collisions', () => {
    expect(mergeConversations([item, { ...item, id: 'shared', syncScope: 'shared' }], {})).toEqual([
      item,
    ])
    const remote = {
      id: item.id,
      role: 'user',
      content: 'not private',
      createdAt: item.createdAt,
      scope: 'shared',
    }
    expect(mergeConversations([item], { ['chat/' + item.id]: remote })).toEqual([item])
  })
  it('projects only public fields and preserves local companion permissions/settings on apply', () => {
    const data = createSeedLibrary()
    data.companion.messages = [item, { ...item, id: 'shared', syncScope: 'shared' }]
    const records = projectLibrary(data)
    expect(Object.keys(records).filter((key) => key.startsWith('chat/'))).toEqual(['chat/shared'])
    expect(records['chat/shared']).not.toHaveProperty('contextSummary')
    const merged = mergeLibrary(data, records)
    expect(merged.companion.permissions).toEqual(data.companion.permissions)
    expect(merged.companion.messages).toHaveLength(2)
    expect(merged.companion.memories).toEqual(data.companion.memories)
  })
  it('fails closed on any private scope or malformed chat record', () => {
    for (const patch of [
      { scope: 'local' },
      { role: 'system' },
      { content: '' },
      { createdAt: 'not a date' },
    ])
      expect(() =>
        validateRecords({
          'chat/one': {
            id: 'one',
            role: 'user',
            content: 'hi',
            scope: 'shared',
            createdAt: item.createdAt,
            ...patch,
          },
        }),
      ).toThrow()
  })
})
