import type { CompanionMessage } from '../../domain/models'
/** Unmarked legacy messages remain private. Ordinary tool turns remain local. */
export function inConversationLane(message: CompanionMessage, local: boolean) {
  const ordinary = message.syncScope === 'shared' || message.syncScope === 'ordinary-local'
  return local ? !ordinary : ordinary
}
