import { expect, it } from 'vitest'
import { conversationMessages } from './conversationMessages'
import type { CompanionMessage } from '../../domain/models'

it('merges display-only and saved messages chronologically without changing either source', () => {
  const make = (id: string, second: number): CompanionMessage => ({ id, role: 'companion', content: id, createdAt: `2026-10-12T08:00:0${second}Z` })
  const saved = [make('before', 1), make('after', 4)], transient = [make('private-user', 2), make('private-answer', 3)]
  expect(conversationMessages(saved, transient).map(message => message.id)).toEqual(['before', 'private-user', 'private-answer', 'after'])
  expect(saved).toHaveLength(2); expect(transient).toHaveLength(2)
})
