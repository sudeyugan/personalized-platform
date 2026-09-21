import type { AgentApplicationServices } from './applicationServices'
import type { AgentToolCall, AgentToolDefinition, AgentToolResult } from './types'

export interface AgentTool {
  definition: AgentToolDefinition
  execute(args: Record<string, unknown>, services: AgentApplicationServices): Promise<unknown> | unknown
}

function validateArguments(definition: AgentToolDefinition, value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const args = value as Record<string, unknown>
  if (definition.inputSchema.additionalProperties === false && Object.keys(args).some((key) => !(key in definition.inputSchema.properties))) return undefined
  for (const required of definition.inputSchema.required ?? []) {
    if (!(required in args)) return undefined
  }
  for (const [key, property] of Object.entries(definition.inputSchema.properties)) {
    const current = args[key]
    if (current === undefined) continue
    if (property.type === 'string' && (typeof current !== 'string' || (property.minLength !== undefined && current.trim().length < property.minLength) || (property.enum && !property.enum.includes(current)))) return undefined
  }
  return args
}

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentTool>()

  register(tool: AgentTool) {
    if (this.tools.has(tool.definition.name)) throw new Error(`Agent tool already registered: ${tool.definition.name}`)
    this.tools.set(tool.definition.name, tool)
    return this
  }

  lookup(name: string) {
    return this.tools.get(name)
  }

  definitions() {
    return [...this.tools.values()].map((tool) => tool.definition)
  }

  async execute(call: AgentToolCall, services: AgentApplicationServices): Promise<AgentToolResult> {
    const tool = this.lookup(call.name)
    if (!tool) return { success: false, error: { code: 'ToolNotFound', message: `找不到工具：${call.name}` } }
    const args = validateArguments(tool.definition, call.arguments)
    if (!args) return { success: false, error: { code: 'InvalidArguments', message: `工具 ${call.name} 的参数不符合 schema` } }
    try {
      return { success: true, data: await tool.execute(args, services) }
    } catch (error) {
      return { success: false, error: { code: 'ExecutionFailed', message: error instanceof Error ? error.message : '工具执行失败' } }
    }
  }
}
