export type AgentCapability = 'read' | 'presentation' | 'create' | 'modify' | 'delete' | 'external' | 'system'
export type AgentRiskLevel = 'read_only' | 'low' | 'medium' | 'high' | 'critical'
export type AgentToolScope = 'none' | 'active_work' | 'chapters' | 'records' | 'memory'

export interface AgentContextSnapshot {
  page: string
  companion: { name: string }
  activeWork?: { id: string; title: string }
  activeChapter?: { id: string; title: string }
  selection?: string
}

export interface AgentJsonSchema {
  type: 'object'
  properties: Record<string, { type: 'string'; description?: string; minLength?: number; enum?: string[] }>
  required?: string[]
  additionalProperties?: boolean
}

export interface AgentToolDefinition {
  name: string
  description: string
  inputSchema: AgentJsonSchema
  capability: AgentCapability
  risk: AgentRiskLevel
  scope: AgentToolScope
}

export interface AgentToolCall {
  id: string
  name: string
  arguments: unknown
}

export interface AgentPermissionRequest {
  call: AgentToolCall
  tool: AgentToolDefinition
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  toolName?: string
  toolCall?: AgentToolCall
}

export interface AgentModelRequest {
  messages: AgentMessage[]
  context: AgentContextSnapshot
  tools: AgentToolDefinition[]
}

export type AgentModelResponse =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; call: AgentToolCall }

export interface AgentModelProvider {
  readonly id: string
  generate(request: AgentModelRequest, options?: { onTextDelta?: (delta: string) => void; signal?: AbortSignal }): Promise<AgentModelResponse>
  testConnection(): Promise<string>
}

export type AgentErrorCode =
  | 'ToolNotFound'
  | 'InvalidArguments'
  | 'PermissionDenied'
  | 'ExecutionFailed'
  | 'Timeout'
  | 'AgentStepLimit'
  | 'AgentCancelled'
  | 'ModelError'

export interface AgentToolResult {
  success: boolean
  data?: unknown
  error?: { code: AgentErrorCode; message: string }
}

export type AgentSessionEvent =
  | { type: 'context'; context: AgentContextSnapshot; timestamp: string }
  | { type: 'user'; content: string; timestamp: string }
  | { type: 'assistant'; content: string; timestamp: string }
  | { type: 'tool_call'; call: AgentToolCall; timestamp: string }
  | { type: 'tool_result'; callId: string; name: string; result: AgentToolResult; timestamp: string }

export interface AgentSession {
  id: string
  createdAt: string
  events: AgentSessionEvent[]
}

export type AgentAuditRecord = CompanionAgentAuditEntry

export type AgentRuntimeStatus =
  | { phase: 'thinking' }
  | { phase: 'using_tool'; toolName: string }
  | { phase: 'waiting_permission'; toolName: string }
  | { phase: 'responding' }
  | { phase: 'error'; message: string }
import type { CompanionAgentAuditEntry } from '../../../domain/models'
