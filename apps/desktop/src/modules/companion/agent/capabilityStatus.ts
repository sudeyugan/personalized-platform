import type { LibraryData } from '../../../domain/models'
import { AgentPermissionEngine } from './permission'
import { buildAgentAccess } from './context'
import { createAgentApplicationServices } from './applicationServices'
import { createCompanionToolRegistry } from './tools'
import { featuresForTool, listAgentCapabilities } from './capabilityCoverage'

export function describeCapabilityStatus(data: LibraryData, temporaryWorkIds: string[]) {
  const registry = createCompanionToolRegistry()
  const access = buildAgentAccess(data, temporaryWorkIds)
  const permission = new AgentPermissionEngine({ policy: { autoAllow: ['read', 'presentation', 'external'] }, resourcePermissions: data.companion.permissions, access, computer: data.companion.computer, modules: data.settings.modules })
  const definitions = registry.definitions()
  const action = (name: string) => {
    const tool = definitions.find(item => item.name === name)!
    const args = tool.name === 'chapter.get' ? { id: [...access.chapterIds][0] ?? '' } : {}
    const decision = permission.check(tool, args)
    if (name.startsWith('browser.') && name !== 'browser.status' && decision.allowed) return {
      name, description: tool.description,
      status: data.companion.browser?.enabled && data.settings.trust.externalAiProcessing ? '需连接与网站授权' : '暂不可用',
      reason: '先在Edge浏览器连接中开启并配对，网站在一隅添加并在Edge确认。只访问本次指定网站；可准备缺少的页面，已填登录表单和页面导航/检索分别需逐站勾选。任务结论还需当前页面证据核验，账号登录不等于查询完成。',
    }
    const status = tool.computer && data.companion.computer.enabled ? '按目标复核' : decision.allowed ? '可以执行' : decision.requiresConfirmation ? '需要确认' : '暂不可用'
    return { name, description: tool.description, status, reason: decision.reason }
  }
  const features = listAgentCapabilities(registry, createAgentApplicationServices(data, access)).map(feature => ({ ...feature, actions: feature.tools.map(action) }))
  const global = definitions.filter(tool => !featuresForTool(tool).length).map(tool => action(tool.name))
  return { features, global }
}
