import type { CompanionData } from '../../domain/models'
import { resolveBrowserTask } from './taskGoal'
export { followedLiveIntent } from './taskGoal'
export function browserRequestedSites(message: string, sites: string[]) {
  return resolveBrowserTask(message, { browser: { enabled: true, sites } } as CompanionData)?.origins ?? []
}
export function browserTaskSites(message: string, companion: CompanionData) {
  return resolveBrowserTask(message, companion)?.origins ?? []
}
