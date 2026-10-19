import type { Records } from '@yiyu/sync'
import type { CompanionMessage } from '../../domain/models'
export function sharedConversations(messages: CompanionMessage[]) {
  return messages
    .filter(
      (message) =>
        message.syncScope === 'shared' &&
        !message.localOnly &&
        message.content.trim() &&
        message.content.length <= 12000,
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      scope: 'shared',
    }))
}
export function mergeConversations(
  messages: CompanionMessage[],
  records: Records,
): CompanionMessage[] {
  const local = messages.filter((message) => message.syncScope !== 'shared' || message.localOnly)
  const protectedIds = new Set(local.map((message) => message.id))
  const incoming = Object.entries(records)
    .filter(([key]) => key.startsWith('chat/'))
    .map(([, value]) => value)
    .filter((value) => !protectedIds.has(String(value.id)))
    .map((value) => ({
      id: String(value.id),
      role: value.role as 'user' | 'companion',
      content: String(value.content),
      createdAt: String(value.createdAt),
      syncScope: 'shared' as const,
    }))
  return [...local, ...incoming].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
}
