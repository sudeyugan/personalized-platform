import type { AgentPermissionRequest } from './types'

const value = (input: unknown) => typeof input === 'string' ? input : ''

export function describeAgentPermission(request: AgentPermissionRequest) {
  const args = request.call.arguments && typeof request.call.arguments === 'object' && !Array.isArray(request.call.arguments)
    ? request.call.arguments as Record<string, unknown>
    : {}
  if (request.tool.computer) {
    const targetKey = request.tool.computer.targetArgument
    const subject = targetKey ? value(args[targetKey]) : request.tool.description
    const highImpact = request.tool.computer.destructive || request.tool.risk === 'high'
    return {
      title: highImpact ? '确认高影响电脑操作？' : '允许这次电脑操作？',
      subject,
      detail: request.tool.description + ' · ' + request.call.name,
    }
  }
  switch (request.call.name) {
    case 'web.read_page':
    case 'web.read_json': return { title: '读取这个公开来源？', subject: value(args.url), detail: '仅HTTPS GET，无登录/Cookie，不下载文件；读取内容可能进入已配置的对话模型分析，沿用外发保护。' }
    case 'web.live_status': return { title: '查询这位主播的开播状态？', subject: `${value(args.expectedName)} · ${value(args.roomUrl)}`, detail: '向 api.live.bilibili.com 匿名读取房间状态及主播昵称两个固定接口，不打开浏览器或使用视觉；接口受限会明确无法确认。' }
    case 'assignment.create': return { title: '记下这份作业？', subject: value(args.title), detail: `${value(args.date)} ${value(args.time) || '当天结束'} · ${args.repeat === 'weekly' ? `每周 ${Array.isArray(args.weekdays) ? args.weekdays.join('、') : ''}` : '单次'}` }
    case 'assignment.set_submitted': return { title: '更新本期提交记录？', subject: value(args.id), detail: `${value(args.key)} · ${args.submitted === true ? '标为已交' : '撤销已交'}，其他期不变` }
    case 'assignment.set_period': return { title: '调整这期作业？', subject: value(args.id), detail: [value(args.key), value(args.date), args.time === '' ? '当天结束' : value(args.time), args.skipped === true ? '本期停交' : args.skipped === false ? '恢复本期' : ''].filter(Boolean).join(' · ') }
    case 'fortune.draw': return { title: '让伙伴抽这支签？', subject: args.kind === 'love' ? '恋爱签' : args.kind === 'future' ? '前程签' : '今日签', detail: args.guest === true ? '临时客签，不占个人每日签' : '各筒每日一支，已有今日结果会直接复用' }
    case 'todo.create': return { title: '创建待办？', subject: value(args.title), detail: value(args.dueDate) || '今天' }
    case 'todo.update': return { title: '修改待办？', subject: value(args.title) || value(args.id), detail: [value(args.dueDate), value(args.priority), value(args.note)].filter(Boolean).join(' · ') || '修改现有信息' }
    case 'todo.set_completed': return { title: '更新待办状态？', subject: value(args.id), detail: `${value(args.date)} · ${args.completed === 'true' ? '标记完成' : '取消完成'}` }
    case 'calendar.create_event': return { title: '添加日历事务？', subject: value(args.title), detail: [value(args.date), value(args.time)].filter(Boolean).join(' ') }
    case 'calendar.update_event': return { title: '修改日历事务？', subject: value(args.title) || value(args.id), detail: [value(args.date), value(args.time), value(args.note)].filter(Boolean).join(' · ') || '修改现有信息' }
    case 'diary.append': return { title: '写入日记？', subject: value(args.date), detail: value(args.content).slice(0, 120) }
    case 'diary.write': return { title: '改写这天的日记？', subject: `${value(args.date)} · ${value(args.title)}`, detail: value(args.content).slice(0, 120) }
    case 'work.create': return { title: '新建作品？', subject: value(args.title), detail: '会切换到新作品' }
    case 'work.rename_current': return { title: '重命名当前作品？', subject: value(args.title), detail: '只修改作品名称' }
    case 'chapter.create': return { title: '新建章节？', subject: value(args.title), detail: '将在当前已授权作品中创建' }
    case 'chapter.rename': return { title: '重命名章节？', subject: value(args.title), detail: value(args.id) }
    case 'chapter.append': return { title: '追加章节正文？', subject: value(args.id), detail: value(args.content).slice(0, 120) }
    case 'record.create': return { title: '新建资料？', subject: value(args.name), detail: value(args.type) }
    case 'record.update': return { title: '修改资料？', subject: value(args.name) || value(args.id), detail: value(args.description).slice(0, 120) || value(args.type) }
    case 'course.create': return { title: '添加课程？', subject: value(args.title), detail: `星期 ${value(args.day)} · 第 ${value(args.period)} 节` }
    case 'course.update': return { title: '修改课程？', subject: value(args.title) || value(args.id), detail: [value(args.day), value(args.period), value(args.location)].filter(Boolean).join(' · ') || '修改现有信息' }
    case 'memory.save': return { title: '让伙伴记住？', subject: value(args.content).slice(0, 120), detail: '之后可以在 AI 伙伴设置中查看和删除' }
    case 'task.create': return { title: '开始这个自主任务？', subject: value(args.title), detail: `${Array.isArray(args.steps) ? args.steps.length : 0} 个步骤 · ${value(args.goal).slice(0, 100)}` }
    default: return { title: '允许这次操作？', subject: request.tool.description, detail: request.call.name }
  }
}
