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
      status: data.companion.browser?.enabled && data.settings.trust.externalAiProcessing ? data.companion.browser.backend==='managed'?'按网站授权核验':'需连接与网站授权' : '暂不可用',
      reason: data.companion.browser?.backend==='managed'?'使用小鱼专用浏览器，首次需在设置中手动登录；后续无窗口查询，仅访问授权网站。低风险导航/检索/筛选需逐站允许，发送/删除/支付不开放；结论需当前页面证据。':'先连接Edge扩展并确认已添加网站。只访问本次目标；已填登录接续与导航/检索分别授权，任务结论需当前页面证据。',
    }
    const status = tool.computer && data.companion.computer.enabled ? '按目标复核' : decision.allowed ? '可以执行' : decision.requiresConfirmation ? '需要确认' : '暂不可用'
    return { name, description: tool.description, status, reason: decision.reason }
  }
  const features = listAgentCapabilities(registry, createAgentApplicationServices(data, access)).map(feature => ({ ...feature, actions: feature.tools.map(action) }))
  const global = definitions.filter(tool => !featuresForTool(tool).length).map(tool => action(tool.name))
  return { features, global }
}
