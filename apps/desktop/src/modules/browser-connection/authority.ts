import { useLibraryStore } from '../../state/useLibraryStore'
import { moduleStatus } from '../../domain/moduleAvailability'
export function browserConnectionEnabled() {
  const { data } = useLibraryStore.getState(), module = moduleStatus(data.settings.modules, 'companion')
  return Boolean(module.enabled && module.available && data.companion.browser?.enabled && (data.companion.permissions.fullAccess || data.companion.permissions.internet))
}
export function browserAccessEnabled() { return browserConnectionEnabled() && useLibraryStore.getState().data.settings.trust.externalAiProcessing }
