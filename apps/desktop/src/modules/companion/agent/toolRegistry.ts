import type { AgentApplicationServices } from './applicationServices'
import type { AgentJsonSchemaProperty, AgentToolCall, AgentToolDefinition, AgentToolExecutionContext, AgentToolResult } from './types'

export interface AgentTool {
  definition: AgentToolDefinition
  execute(args: Record<string, unknown>, services: AgentApplicationServices, context: AgentToolExecutionContext): Promise<unknown> | unknown
}

function validProperty(property: AgentJsonSchemaProperty, value: unknown): boolean {
  if (property.type === 'string') return typeof value === 'string' && (property.minLength === undefined || value.trim().length >= property.minLength) && (!property.enum || property.enum.includes(value))
  if (property.type === 'number') return typeof value === 'number' && Number.isFinite(value) && (property.minimum === undefined || value >= property.minimum) && (property.maximum === undefined || value <= property.maximum) && (!property.enum || property.enum.includes(value))
  if (property.type === 'boolean') return typeof value === 'boolean' && (!property.enum || property.enum.includes(value))
  if (property.type === 'array') return Array.isArray(value) && (!property.items || value.every((item) => validProperty(property.items!, item)))
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const object = value as Record<string, unknown>
  if (property.additionalProperties === false && Object.keys(object).some((key) => !(key in (property.properties ?? {})))) return false
  if ((property.required ?? []).some((key) => !(key in object))) return false
  return Object.entries(property.properties ?? {}).every(([key, child]) => object[key] === undefined || validProperty(child, object[key]))
}

function validateArguments(definition: AgentToolDefinition, value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const args = value as Record<string, unknown>
  if (definition.inputSchema.additionalProperties === false && Object.keys(args).some((key) => !(key in definition.inputSchema.properties))) return undefined
  for (const required of definition.inputSchema.required ?? []) if (!(required in args)) return undefined
  for (const [key, property] of Object.entries(definition.inputSchema.properties)) {
    if (args[key] !== undefined && !validProperty(property, args[key])) return undefined
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

  registerAll(tools: AgentTool[]) {
    tools.forEach((tool) => this.register(tool))
    return this
  }

  lookup(name: string) { return this.tools.get(name) }
  definitions() { return [...this.tools.values()].map((tool) => tool.definition) }

  async execute(call: AgentToolCall, services: AgentApplicationServices, context: AgentToolExecutionContext = { confirmed: false }): Promise<AgentToolResult> {
    const tool = this.lookup(call.name)
    if (!tool) return { success: false, error: { code: 'ToolNotFound', message: `找不到工具：${call.name}` } }
    const args = validateArguments(tool.definition, call.arguments)
    if (!args) return { success: false, error: { code: 'InvalidArguments', message: `工具 ${call.name} 的参数不符合 schema` } }
    try {
      return { success: true, data: await tool.execute(args, services, context) }
    } catch (error) {
      return { success: false, error: { code: 'ExecutionFailed', message: error instanceof Error ? error.message : '工具执行失败' } }
    }
  }
}