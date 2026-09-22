import type { AgentApplicationServices } from './applicationServices'
import { AgentPermissionEngine, permissionDeniedResult } from './permission'
import { AgentToolRegistry } from './toolRegistry'
import type { AgentAuditRecord, AgentContextSnapshot, AgentErrorCode, AgentMessage, AgentModelProvider, AgentPermissionRequest, AgentRuntimeStatus, AgentSession, AgentToolCall, AgentToolResult } from './types'

export const DEFAULT_MAX_TOOL_STEPS = 4

function modelErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return '模型请求失败'
}

export class AgentRuntimeError extends Error {
  readonly code: AgentErrorCode
  constructor(code: AgentErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export interface RunAgentInput {
  message: string
  history: AgentMessage[]
  context: AgentContextSnapshot
  provider: AgentModelProvider
  registry: AgentToolRegistry
  permissions: AgentPermissionEngine
  services: AgentApplicationServices
  maxToolSteps?: number
  onStatus?: (status: AgentRuntimeStatus) => void
  onTextDelta?: (delta: string) => void
  onAudit?: (record: AgentAuditRecord) => void
  requestPermission?: (request: AgentPermissionRequest) => Promise<boolean>
  responseMode?: 'text' | 'voice'
  voiceReplyLength?: 'short' | 'standard'
  signal?: AbortSignal
}

function cancellationError() {
  return new AgentRuntimeError('AgentCancelled', '已中止本轮回答')
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw cancellationError()
}

function withCancellation<T>(operation: Promise<T>, signal?: AbortSignal) {
  if (!signal) return operation
  throwIfCancelled(signal)
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(cancellationError())
    signal.addEventListener('abort', cancel, { once: true })
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel))
  })
}

function auditArguments(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (/password|secret|token|key|content/i.test(key)) return [key, '[redacted]']
    return [key, typeof item === 'string' ? `[string:${item.length}]` : item]
  }))
}

function toolResultMessage(call: AgentToolCall, result: AgentToolResult): AgentMessage {
  return { role: 'tool', toolCallId: call.id, toolName: call.name, content: JSON.stringify(result) }
}

export async function runAgent(input: RunAgentInput) {
  const timestamp = new Date().toISOString()
  const session: AgentSession = {
    id: `agent-session-${crypto.randomUUID()}`,
    createdAt: timestamp,
    events: [{ type: 'context', context: input.context, timestamp }, { type: 'user', content: input.message, timestamp }],
  }
  const audit: AgentAuditRecord[] = []
  const messages: AgentMessage[] = [
    ...input.history,
    { role: 'system', content: `你是一隅 AI 伙伴。当前北京时间是 ${input.context.localTime.date} ${input.context.localTime.weekday} ${input.context.localTime.time}（${input.context.localTime.period}，Asia/Shanghai）。涉及“今天、明天、现在、早上”等相对时间时，必须以此为准。只能通过提供的 Tool 获取或修改应用数据；不得假设未返回的信息。任何写入都必须通过 Tool 并等待应用确认，不能声称未执行的操作已经完成。Tool 出错时应解释限制，不得伪造结果。若提供 companion.set_state，可在最终回答前根据语气选择一次视觉状态；它只改变表现，不代表事实判断。回答第一段必须是可独立朗读的直接结论，避免重复问题。${input.responseMode === 'voice' ? input.voiceReplyLength === 'standard' ? '用户正在语音交互：回答保持自然口语，通常不超过 8 句，不使用 Markdown；除非用户明确要求详细展开。' : '用户正在语音交互：默认只回答 2 至 4 句，使用自然口语，不使用 Markdown；除非用户明确要求详细展开。' : '默认保持简洁；需要结构时可使用少量 Markdown。'}` },
    { role: 'user', content: input.message },
  ]
  let toolSteps = 0
  const maxToolSteps = input.maxToolSteps ?? DEFAULT_MAX_TOOL_STEPS

  while (true) {
    throwIfCancelled(input.signal)
    input.onStatus?.({ phase: 'thinking' })
    let response
    try {
      response = await withCancellation(input.provider.generate(
        { messages, context: input.context, tools: input.registry.definitions() },
        { onTextDelta: input.onTextDelta, signal: input.signal },
      ), input.signal)
    } catch (error) {
      if (error instanceof AgentRuntimeError && error.code === 'AgentCancelled') throw error
      const message = modelErrorMessage(error)
      input.onStatus?.({ phase: 'error', message })
      throw new AgentRuntimeError('ModelError', message)
    }
    if (response.type === 'text') {
      throwIfCancelled(input.signal)
      input.onStatus?.({ phase: 'responding' })
      session.events.push({ type: 'assistant', content: response.text, timestamp: new Date().toISOString() })
      return { text: response.text, session, audit }
    }
    if (toolSteps >= maxToolSteps) {
      const message = `Agent 已达到最多 ${maxToolSteps} 次工具调用，已安全停止。`
      input.onStatus?.({ phase: 'error', message })
      throw new AgentRuntimeError('AgentStepLimit', message)
    }
    toolSteps += 1
    const call = response.call
    throwIfCancelled(input.signal)
    const started = performance.now()
    session.events.push({ type: 'tool_call', call, timestamp: new Date().toISOString() })
    input.onStatus?.({ phase: 'using_tool', toolName: call.name })
    const tool = input.registry.lookup(call.name)
    const decision = tool ? input.permissions.check(tool.definition, call.arguments) : { allowed: true, reason: '工具不存在，由 Registry 返回错误' }
    let confirmed = false
    if (tool && decision.requiresConfirmation && input.requestPermission) {
      input.onStatus?.({ phase: 'waiting_permission', toolName: call.name })
      confirmed = await withCancellation(input.requestPermission({ call, tool: tool.definition }), input.signal)
    }
    throwIfCancelled(input.signal)
    const permitted = decision.allowed || confirmed
    const denialReason = decision.requiresConfirmation
      ? input.requestPermission ? '用户取消了这次写入操作' : '当前界面无法显示写入确认'
      : decision.reason
    const result = permitted ? await withCancellation(input.registry.execute(call, input.services), input.signal) : permissionDeniedResult(denialReason)
    const durationMs = Math.max(0, Math.round(performance.now() - started))
    const auditRecord: AgentAuditRecord = {
      id: `agent-audit-${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      sessionId: session.id,
      toolName: call.name,
      arguments: auditArguments(call.arguments),
      permissionDecision: permitted ? 'allowed' : 'denied',
      resultStatus: result.success ? 'success' : 'error',
      durationMs,
      errorCode: result.error?.code,
    }
    audit.push(auditRecord)
    input.onAudit?.(auditRecord)
    session.events.push({ type: 'tool_result', callId: call.id, name: call.name, result, timestamp: new Date().toISOString() })
    messages.push({ role: 'assistant', content: '', toolCallId: call.id, toolName: call.name, toolCall: call }, toolResultMessage(call, result))
  }
}
