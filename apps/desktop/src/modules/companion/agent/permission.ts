import type { CompanionPermission } from '../../../domain/models'
import type { AgentCapability, AgentToolDefinition, AgentToolResult } from './types'
import type { AgentAccessSnapshot } from './context'

export interface AgentPermissionPolicy {
  autoAllow: AgentCapability[]
}

export interface AgentPermissionEnvironment {
  policy: AgentPermissionPolicy
  resourcePermissions: CompanionPermission
  access: AgentAccessSnapshot
}

export interface AgentPermissionDecision {
  allowed: boolean
  requiresConfirmation?: boolean
  reason: string
}

export class AgentPermissionEngine {
  private readonly environment: AgentPermissionEnvironment
  constructor(environment: AgentPermissionEnvironment) { this.environment = environment }

  check(tool: AgentToolDefinition, args: unknown): AgentPermissionDecision {
    if (tool.capability === 'delete' || tool.capability === 'system' || tool.risk === 'high' || tool.risk === 'critical') {
      return { allowed: false, reason: '高风险、删除或系统操作不向伙伴开放' }
    }
    if (tool.capability === 'external' && tool.scope !== 'web') {
      return { allowed: false, reason: '未登记的外部能力不向伙伴开放' }
    }
    if (tool.scope === 'active_work' && !this.environment.access.activeWorkAllowed) {
      return { allowed: false, reason: '当前作品未授权给伙伴访问' }
    }
    if (tool.scope === 'records' && !this.environment.resourcePermissions.records) {
      return { allowed: false, reason: '人物资料未授权给伙伴读取' }
    }
    const personalScopes = {
      todos: ['todos', '待办'],
      calendar: ['calendar', '日历事务'],
      courses: ['courses', '课表'],
      daily_question: ['dailyQuestions', '朝问'],
      diary: ['diary', '日记'],
      mood: ['mood', '情绪记录'],
      memory: ['memories', '伙伴记忆'],
      answer_book: ['answerBook', '答案之书收藏'],
      music: ['musicContext', '音乐信息'],
      web: ['internet', '联网查询'],
    } as const
    if (tool.scope in personalScopes) {
      const [permission, label] = personalScopes[tool.scope as keyof typeof personalScopes]
      if (!this.environment.resourcePermissions[permission]) return { allowed: false, reason: `${label}未授权给伙伴读取` }
    }
    if (tool.scope === 'chapters') {
      const id = typeof args === 'object' && args !== null && 'id' in args ? String((args as { id: unknown }).id) : undefined
      if (id && !this.environment.access.chapterIds.has(id)) return { allowed: false, reason: '目标章节未授权给伙伴读取' }
      if (!id && this.environment.access.chapterIds.size === 0) return { allowed: false, reason: '没有已授权的章节可供查询' }
    }
    if ((tool.capability === 'create' || tool.capability === 'modify') && !this.environment.resourcePermissions.writeActions) {
      return { allowed: false, reason: '请先在 AI 伙伴设置中开启“允许提出写入操作”' }
    }
    if (tool.capability === 'create' || tool.capability === 'modify') {
      if (this.environment.resourcePermissions.writePolicy === 'balanced' && tool.risk === 'low') {
        return { allowed: true, reason: '平衡模式允许低风险写入自动执行' }
      }
      return { allowed: false, requiresConfirmation: true, reason: '写入操作需要用户逐次确认' }
    }
    if (tool.capability === 'external' && tool.scope === 'web') return { allowed: true, reason: '用户已允许联网查询' }
    if (!this.environment.policy.autoAllow.includes(tool.capability)) {
      return { allowed: false, reason: `能力 ${tool.capability} 未获自动执行许可` }
    }
    return { allowed: true, reason: '已通过统一权限检查' }
  }
}

export function permissionDeniedResult(reason: string): AgentToolResult {
  return { success: false, error: { code: 'PermissionDenied', message: reason } }
}
