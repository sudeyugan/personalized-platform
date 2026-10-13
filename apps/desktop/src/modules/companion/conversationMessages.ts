import type { CompanionMessage } from '../../domain/models'
import { isLegacyBrowserSummary } from './browserHistorySummary'

/** Temporary replies share the timeline, not the persisted history. */
export function conversationMessages(saved: CompanionMessage[], transient: CompanionMessage[]) {
  return [...saved.filter(message => !isLegacyBrowserSummary(message)), ...transient].sort((left, right) => (Date.parse(left.createdAt) || 0) - (Date.parse(right.createdAt) || 0))
}
