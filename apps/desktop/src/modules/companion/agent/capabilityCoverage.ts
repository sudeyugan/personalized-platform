import { agentFeatureContracts } from './featureContract'
import type { AgentToolDefinition } from './types'
import type { AgentToolRegistry } from './toolRegistry'
import type { AgentApplicationServices } from './applicationServices'

export function featuresForTool(tool: AgentToolDefinition) {
  return Object.values(agentFeatureContracts).filter((feature) => feature.tools.includes(tool.name)
    || (feature.readScope !== 'none' && tool.scope === feature.readScope)
    || (feature.view === 'writing' && tool.scope === 'active_work'))
}

export function listAgentCapabilities(registry: AgentToolRegistry, services: AgentApplicationServices) {
  return Object.values(agentFeatureContracts).map(({ id, view, description, destinations }) => {
    const actions = registry.definitions().filter((tool) => featuresForTool(tool).some((feature) => feature.id === id))
      .map(({ name, capability, risk }) => ({ name, capability, risk }))
    return {
      id, description, destinations, ...services.getModuleStatus?.(view),
      tools: actions.map((action) => action.name), actions,
      boundary: '仅列出的动作已接入；其他界面操作并非权限不足，不代表可自动执行。删除、秘密、加密解锁和系统权限独立保护。',
    }
  })
}
