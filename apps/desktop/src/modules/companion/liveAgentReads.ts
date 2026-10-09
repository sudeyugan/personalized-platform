import { useLibraryStore } from '../../state/useLibraryStore'
import { createAgentApplicationServices, type AgentApplicationServices } from './agent/applicationServices'
import { buildAgentAccess } from './agent/context'

/** Reads must use the same live permissions as the execution gate, not the
 * snapshot captured before model latency or a confirmation dialog. */
export function withLiveAgentReads(services: AgentApplicationServices): AgentApplicationServices {
  return new Proxy(services, {
    get(target, property, receiver) {
      const store = useLibraryStore.getState()
      const reads = createAgentApplicationServices(store.data, buildAgentAccess(store.data, store.temporaryCompanionWorkIds))
      return Object.hasOwn(reads, property) ? Reflect.get(reads, property) : Reflect.get(target, property, receiver)
    },
  })
}
