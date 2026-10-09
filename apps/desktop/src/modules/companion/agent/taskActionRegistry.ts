import type { AgentTask, AgentTaskStep, CompanionAgentAuditEntry } from '../../../domain/models'
import type { AgentApplicationServices } from './applicationServices'
import { AgentPermissionEngine } from './permission'
import { AgentToolRegistry } from './toolRegistry'
import type { AgentToolDefinition } from './types'
import { localRitualTools } from './ritualTools'

const reservedTools = new Set(['task.create', 'companion.set_state', 'screen.record_start', 'screen.record_stop'])

export function isTaskToolEligible(tool: AgentToolDefinition) {
  return !reservedTools.has(tool.name) && !localRitualTools.has(tool.name)
}

export class TaskActionConfirmationRequired extends Error {
  readonly reason: string
  constructor(reason: string) {
    super(reason)
    this.reason = reason
  }
}

function auditArguments(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (/password|secret|token|key|content/i.test(key)) return [key, '[redacted]']
    return [key, typeof item === 'string' ? `[string:${item.length}]` : item]
  }))
}

function valueAtPath(value: unknown, path: string) {
  return path.split('.').filter(Boolean).reduce<unknown>((current, part) => {
    if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)]
    if (current && typeof current === 'object' && part in current) return (current as Record<string, unknown>)[part]
    return undefined
  }, value)
}

function resolveReference(reference: string, task: AgentTask, stepIndex: number) {
  const lastMatch = /^last(?:\.(.+))?$/.exec(reference)
  if (lastMatch) {
    const previous = [...task.steps.slice(0, stepIndex)].reverse().find((step) => step.result !== undefined)
    return lastMatch[1] ? valueAtPath(previous?.result, lastMatch[1]) : previous?.result
  }
  const stepMatch = /^steps\.(\d+)(?:\.(.+))?$/.exec(reference)
  if (!stepMatch) return undefined
  const result = task.steps[Number(stepMatch[1])]?.result
  return stepMatch[2] ? valueAtPath(result, stepMatch[2]) : result
}

export function resolveTaskArguments(value: unknown, task: AgentTask, stepIndex: number): unknown {
  if (typeof value === 'string') {
    const exact = /^\{\{([^{}]+)\}\}$/.exec(value.trim())
    if (exact) {
      const resolved = resolveReference(exact[1].trim(), task, stepIndex)
      if (resolved === undefined) throw new Error(`任务引用没有结果：${exact[1].trim()}`)
      return resolved
    }
    return value.replace(/\{\{([^{}]+)\}\}/g, (_match, reference: string) => {
      const resolved = resolveReference(reference.trim(), task, stepIndex)
      if (resolved === undefined) throw new Error(`任务引用没有结果：${reference.trim()}`)
      return typeof resolved === 'string' ? resolved : JSON.stringify(resolved)
    })
  }
  if (Array.isArray(value)) return value.map((item) => resolveTaskArguments(item, task, stepIndex))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveTaskArguments(item, task, stepIndex)]))
  }
  return value
}

function compactResult(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]'
  if (typeof value === 'string') return value.length > 4000 ? `${value.slice(0, 4000)}…` : value
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => compactResult(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 80).map(([key, item]) => [key, compactResult(item, depth + 1)]))
  }
  return value
}

export class TaskActionRegistry {
  private readonly tools: AgentToolRegistry
  private readonly permissions: AgentPermissionEngine
  private readonly services: AgentApplicationServices
  private readonly sessionId: string
  private readonly onAudit: (entry: CompanionAgentAuditEntry) => void

  constructor(
    tools: AgentToolRegistry,
    permissions: AgentPermissionEngine,
    services: AgentApplicationServices,
    sessionId: string,
    onAudit: (entry: CompanionAgentAuditEntry) => void,
  ) {
    this.tools = tools
    this.permissions = permissions
    this.services = services
    this.sessionId = sessionId
    this.onAudit = onAudit
  }

  definitions() {
    return this.tools.definitions().filter(isTaskToolEligible)
  }

  async execute(step: AgentTaskStep, task: AgentTask, stepIndex: number) {
    const toolName = step.toolName?.trim()
    const tool = toolName ? this.tools.lookup(toolName) : undefined
    if (!tool || !isTaskToolEligible(tool.definition)) throw new Error(`任务动作不可用：${toolName || '未指定 Tool'}`)
    const args = resolveTaskArguments(step.arguments ?? {}, task, stepIndex)
    const resolvedToolName = tool.definition.name
    const decision = this.permissions.check(tool.definition, args)
    const started = performance.now()
    const audit = (resultStatus: 'success' | 'error', errorCode?: CompanionAgentAuditEntry['errorCode'], errorDetail?: string) => {
    const permissionGranted = decision.allowed || Boolean(decision.requiresConfirmation && step.confirmed)
      this.onAudit({
        id: `agent-audit-${crypto.randomUUID()}`,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        toolName: resolvedToolName,
        arguments: auditArguments(args),
        permissionDecision: permissionGranted ? 'allowed' : 'denied',
        resultStatus,
        durationMs: Math.max(0, Math.round(performance.now() - started)),
        errorCode,
        errorDetail,
        confirmed: Boolean(step.confirmed),
        permissionReason: decision.reason,
      })
    }
    if (!decision.allowed) {
      if (decision.requiresConfirmation) {
        if (!step.confirmed) {
          audit('error', 'PermissionDenied', decision.reason)
          throw new TaskActionConfirmationRequired(decision.reason)
        }
      } else {
        audit('error', 'PermissionDenied', decision.reason)
        throw new Error(decision.reason)
      }
    }
    const result = await this.tools.execute({
      id: `task-call-${crypto.randomUUID()}`,
      name: resolvedToolName,
      arguments: args,
    }, this.services, { confirmed: Boolean(step.confirmed) })
    if (!result.success) {
      audit('error', result.error?.code, result.error?.message)
      throw new Error(result.error?.message ?? `任务 Tool 执行失败：${toolName}`)
    }
    audit('success')
    return compactResult(result.data)
  }
}
