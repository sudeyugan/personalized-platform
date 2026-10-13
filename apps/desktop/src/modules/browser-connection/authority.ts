import { useLibraryStore } from '../../state/useLibraryStore'
import { moduleStatus } from '../../domain/moduleAvailability'
export function browserAccessEnabled() {
  const { data } = useLibraryStore.getState(), module = moduleStatus(data.settings.modules, 'companion')
  return Boolean(module.enabled && module.available && data.companion.browser?.enabled && data.settings.trust.externalAiProcessing && (data.companion.permissions.fullAccess || data.companion.permissions.internet))
}
