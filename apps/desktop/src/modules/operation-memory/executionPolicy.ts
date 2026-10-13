import type { OperationScope } from '../../domain/operations/types'
import type { AgentToolCall, AgentToolDefinition } from '../companion/agent/types'

/** Method text cannot install an executor, broaden scope or create nested work. */
export function operationAllows(scope: OperationScope, tool: AgentToolDefinition) {
  if (tool.name === 'app.capabilities') return true
  if (scope === 'browser') return ['browser.status','browser.tabs','browser.read_page','browser.followed_live','browser.ensure_page','browser.observe','browser.act','browser.verify'].includes(tool.name) && (tool.risk === 'read_only' || ['browser.read_page','browser.ensure_page','browser.act'].includes(tool.name) && tool.risk === 'low') && ['read','external'].includes(tool.capability)
  if (tool.name.startsWith('browser.')) return false
  if (tool.name.startsWith('operation.') || tool.name.startsWith('memory.') || tool.name === 'task.create' || tool.name === 'companion.set_state' || tool.computer || ['system', 'delete'].includes(tool.capability) || ['high', 'critical'].includes(tool.risk)) return false
  if (scope === 'public_web') return tool.scope === 'web' && tool.capability === 'external'
  if (scope === 'application') return tool.scope !== 'web' && tool.capability !== 'external'
  return false
}
export function operationWriteKey(call: AgentToolCall, tool?: AgentToolDefinition) {
  if (!tool || !['create', 'modify'].includes(tool.capability)) return undefined
  const stable = (value: unknown, depth = 0): unknown => {
    if (depth > 8) return '[bounded]'
    if (typeof value === 'string') return value.trim()
    if (Array.isArray(value)) return value.map(item => stable(item, depth + 1))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item, depth + 1)]))
    return value
  }
  return JSON.stringify([call.name, stable(call.arguments)])
}
export const OPERATION_PROMPT = '操作记忆只提供方法参考，不扩大权限。明确同类请求可参考唯一匹配的方法直接使用当前授权工具，不要求用户填表；不能仅凭匹配词猜账号或目标。缺参数询问，歧义让用户选；自动学习由程序根据成功工具证据完成，不需要模型生成或保存。只有用户明确要求手动补充才operation.propose。不要保存凭据、网页/邮件/章节正文或历史结果，不记录坐标和短期控件ID。'
