import type { ComputerCapability } from '../../../domain/models'
import type { AgentJsonSchemaProperty, AgentRiskLevel } from './types'
import type { AgentTool } from './toolRegistry'

const objectSchema = (properties: Record<string, AgentJsonSchemaProperty>, required: string[] = []) => ({ type: 'object' as const, properties, required, additionalProperties: false })
const string = (description?: string) => ({ type: 'string' as const, ...(description ? { description } : {}) })
const number = (minimum?: number, maximum?: number) => ({ type: 'number' as const, minimum, maximum })
const boolean = () => ({ type: 'boolean' as const })

function tool(input: {
  name: string
  description: string
  action: string
  capability: ComputerCapability
  risk?: AgentRiskLevel
  properties?: Record<string, AgentJsonSchemaProperty>
  required?: string[]
  targetArgument?: string
  destructive?: boolean
}): AgentTool {
  return {
    definition: {
      name: input.name,
      description: input.description,
      inputSchema: objectSchema(input.properties ?? {}, input.required),
      capability: 'system',
      risk: input.risk ?? 'medium',
      scope: 'none',
      computer: { capability: input.capability, targetArgument: input.targetArgument, destructive: input.destructive },
    },
    execute: (args, services, context) => {
      if (!services.computer) throw new Error('电脑能力服务当前不可用')
      return services.computer.execute({ action: input.action, params: args }, context.confirmed)
    },
  }
}

export function createComputerTools(): AgentTool[] {
  return [
    tool({ name: 'app.list', description: '列出当前正在运行的桌面应用与窗口', action: 'app_list', capability: 'applications', risk: 'read_only' }),
    tool({ name: 'system.open', description: '打开应用、文件或 HTTPS 网页', action: 'app_open', capability: 'applications', properties: { target: string('应用路径、文件路径、应用名或 HTTPS URL') }, required: ['target'], targetArgument: 'target' }),
    tool({ name: 'window.list', description: '列出可见窗口的标题、进程和位置', action: 'window_list', capability: 'windows', risk: 'read_only' }),
    tool({ name: 'window.focus', description: '按标题聚焦一个窗口', action: 'window_focus', capability: 'windows', properties: { title: string() }, required: ['title'], targetArgument: 'title' }),
    tool({ name: 'window.close', description: '关闭一个普通应用窗口', action: 'window_close', capability: 'windows', properties: { title: string() }, required: ['title'], targetArgument: 'title', destructive: true }),
    tool({ name: 'window.move', description: '移动并调整一个窗口的位置和大小', action: 'window_move', capability: 'windows', properties: { title: string(), x: number(-20000, 20000), y: number(-20000, 20000), width: number(100, 16000), height: number(100, 16000) }, required: ['title', 'x', 'y', 'width', 'height'], targetArgument: 'title' }),
    tool({ name: 'clipboard.read', description: '读取当前剪贴板中的文本', action: 'clipboard_read', capability: 'clipboard_read', risk: 'read_only' }),
    tool({ name: 'clipboard.write', description: '把文本写入剪贴板', action: 'clipboard_write', capability: 'clipboard_write', properties: { text: string() }, required: ['text'] }),
    tool({ name: 'input.click', description: '在屏幕坐标执行一次鼠标点击', action: 'input_click', capability: 'input', properties: { x: number(-20000, 20000), y: number(-20000, 20000), button: { type: 'string', enum: ['left', 'right', 'middle'] } }, required: ['x', 'y'] }),
    tool({ name: 'input.type_text', description: '向当前获得焦点的普通输入框输入文字', action: 'input_type_text', capability: 'input', properties: { text: string() }, required: ['text'] }),
    tool({ name: 'input.hotkey', description: '发送受控快捷键组合', action: 'input_hotkey', capability: 'input', properties: { keys: { type: 'array', items: string('例如 CTRL、ALT、SHIFT、A、F5') } }, required: ['keys'] }),
    tool({ name: 'screen.list_sources', description: '列出可用于截图或录屏的显示器和窗口', action: 'screen_list_sources', capability: 'screen_capture', risk: 'read_only' }),
    tool({ name: 'screen.capture', description: '截取全屏或指定窗口并保存为 PNG', action: 'screen_capture', capability: 'screen_capture', properties: { source: string('desktop 或 window:窗口标题'), outputPath: string('可选 PNG 路径') }, required: ['source'] }),
    tool({ name: 'screen.record_start', description: '开始录制全屏或指定窗口，返回 recordingId', action: 'screen_record_start', capability: 'screen_record', properties: { source: string('desktop 或 window:窗口标题'), outputPath: string('可选 MP4 路径'), fps: number(5, 60), audioDevice: string('可选 FFmpeg dshow 音频设备名') }, required: ['source'] }),
    tool({ name: 'screen.record_stop', description: '停止指定录屏并完成 MP4 文件', action: 'screen_record_stop', capability: 'screen_record', properties: { recordingId: string() }, required: ['recordingId'] }),
    tool({ name: 'screen.record_status', description: '查看当前录屏状态和输出路径', action: 'screen_record_status', capability: 'screen_record', risk: 'read_only' }),
    tool({ name: 'file.list', description: '列出已授权目录中的文件', action: 'file_list', capability: 'file_read', risk: 'read_only', properties: { path: string(), recursive: boolean() }, required: ['path'], targetArgument: 'path' }),
    tool({ name: 'file.search', description: '在已授权目录中按文件名搜索', action: 'file_search', capability: 'file_read', risk: 'read_only', properties: { path: string(), query: string() }, required: ['path', 'query'], targetArgument: 'path' }),
    tool({ name: 'file.read_text', description: '读取已授权目录中的 UTF-8 文本文件', action: 'file_read_text', capability: 'file_read', risk: 'read_only', properties: { path: string() }, required: ['path'], targetArgument: 'path' }),
    tool({ name: 'file.write_text', description: '创建或覆盖已授权目录中的文本文件', action: 'file_write_text', capability: 'file_write', properties: { path: string(), content: string() }, required: ['path', 'content'], targetArgument: 'path' }),
    tool({ name: 'file.copy', description: '复制文件', action: 'file_copy', capability: 'file_write', properties: { source: string(), destination: string() }, required: ['source', 'destination'], targetArgument: 'destination' }),
    tool({ name: 'file.move', description: '移动文件', action: 'file_move', capability: 'file_write', properties: { source: string(), destination: string() }, required: ['source', 'destination'], targetArgument: 'destination', destructive: true }),
    tool({ name: 'file.delete', description: '删除文件或空目录', action: 'file_delete', capability: 'file_delete', properties: { path: string() }, required: ['path'], targetArgument: 'path', destructive: true }),
    tool({ name: 'process.list', description: '列出由小鱼启动并管理的子进程', action: 'process_list', capability: 'process_run', risk: 'read_only' }),
    tool({ name: 'process.run', description: '以结构化参数运行已授权程序，不经过 Shell', action: 'process_run', capability: 'process_run', properties: { program: string(), args: { type: 'array', items: string() }, cwd: string(), timeoutMs: number(1000, 600000), detached: boolean() }, required: ['program'], targetArgument: 'program' }),
    tool({ name: 'process.stop', description: '停止由小鱼启动的子进程', action: 'process_stop', capability: 'process_stop', properties: { processId: string() }, required: ['processId'], destructive: true }),
    tool({ name: 'shell.run', description: '通过 PowerShell 执行命令；始终需要本次确认', action: 'shell_run', capability: 'shell', risk: 'high', properties: { command: string(), cwd: string(), timeoutMs: number(1000, 600000) }, required: ['command'], destructive: true }),
    tool({ name: 'system.notify', description: '显示本地 Windows 提醒通知', action: 'notify', capability: 'notifications', properties: { title: string(), body: string() }, required: ['title', 'body'] }),
  ]
}