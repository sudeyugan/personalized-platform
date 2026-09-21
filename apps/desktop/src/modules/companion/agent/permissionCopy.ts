import type { AgentPermissionRequest } from './types'

const value = (input: unknown) => typeof input === 'string' ? input : ''

export function describeAgentPermission(request: AgentPermissionRequest) {
  const args = request.call.arguments && typeof request.call.arguments === 'object' && !Array.isArray(request.call.arguments)
    ? request.call.arguments as Record<string, unknown>
    : {}
  switch (request.call.name) {
    case 'todo.create': return { title: '创建待办？', subject: value(args.title), detail: value(args.dueDate) || '今天' }
    case 'calendar.create_event': return { title: '添加日历事务？', subject: value(args.title), detail: [value(args.date), value(args.time)].filter(Boolean).join(' ') }
    case 'diary.append': return { title: '写入日记？', subject: value(args.date), detail: value(args.content).slice(0, 120) }
    case 'chapter.create': return { title: '新建章节？', subject: value(args.title), detail: '将在当前已授权作品中创建' }
    case 'memory.save': return { title: '让伙伴记住？', subject: value(args.content).slice(0, 120), detail: '之后可以在 AI 伙伴设置中查看和删除' }
    default: return { title: '允许这次操作？', subject: request.tool.description, detail: request.call.name }
  }
}
