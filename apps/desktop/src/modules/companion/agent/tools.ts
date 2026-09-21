import type { AgentApplicationServices } from './applicationServices'
import type { CompanionVideoState } from '../../../domain/models'
import { AgentToolRegistry } from './toolRegistry'

const emptySchema = { type: 'object' as const, properties: {}, additionalProperties: false }
const querySchema = {
  type: 'object' as const,
  properties: { query: { type: 'string' as const, minLength: 1, description: '要查找的文字' } },
  required: ['query'],
  additionalProperties: false,
}

const requireService = <T>(service: T | undefined, label: string): T => {
  if (!service) throw new Error(`${label} 当前不可用`)
  return service
}

const optionalText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

export function createCompanionToolRegistry(onVisualState?: (state: CompanionVideoState) => void) {
  const registry = new AgentToolRegistry()
    .register({
      definition: { name: 'work.get_current', description: '读取当前已授权作品的基本信息', inputSchema: emptySchema, capability: 'read', risk: 'read_only', scope: 'active_work' },
      execute: (_args, services: AgentApplicationServices) => services.getCurrentWork() ?? { found: false },
    })
    .register({
      definition: { name: 'chapter.search', description: '在伙伴获准读取的章节中搜索文字', inputSchema: querySchema, capability: 'read', risk: 'read_only', scope: 'chapters' },
      execute: (args, services) => services.searchChapters(String(args.query)),
    })
    .register({
      definition: {
        name: 'chapter.get',
        description: '读取一个已授权章节的正文，最多返回前 4000 字',
        inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1, description: '章节 ID' } }, required: ['id'], additionalProperties: false },
        capability: 'read',
        risk: 'read_only',
        scope: 'chapters',
      },
      execute: (args, services) => services.getChapter(String(args.id)) ?? { found: false },
    })
    .register({
      definition: { name: 'character.search', description: '按姓名、别名或简介搜索一隅中的人物资料', inputSchema: querySchema, capability: 'read', risk: 'read_only', scope: 'records' },
      execute: (args, services) => services.searchCharacters(String(args.query)),
    })
    .register({
      definition: { name: 'place.search', description: '按名称、别名、区域或描述搜索一隅中的地点资料', inputSchema: querySchema, capability: 'read', risk: 'read_only', scope: 'records' },
      execute: (args, services) => services.searchPlaces(String(args.query)),
    })
    .register({
      definition: { name: 'timeline.search', description: '按标题、时间或描述搜索一隅中的时间线事件', inputSchema: querySchema, capability: 'read', risk: 'read_only', scope: 'records' },
      execute: (args, services) => services.searchTimeline(String(args.query)),
    })
    .register({
      definition: { name: 'todo.create', description: '创建一条待办；真正写入前必须由用户确认', inputSchema: { type: 'object', properties: { title: { type: 'string', minLength: 1, description: '待办标题' }, dueDate: { type: 'string', description: '可选日期，格式 YYYY-MM-DD' } }, required: ['title'], additionalProperties: false }, capability: 'create', risk: 'medium', scope: 'none' },
      execute: (args, services) => requireService(services.createTodo, '待办写入')!(String(args.title), optionalText(args.dueDate)),
    })
    .register({
      definition: { name: 'calendar.create_event', description: '在日历中创建事务；真正写入前必须由用户确认', inputSchema: { type: 'object', properties: { title: { type: 'string', minLength: 1, description: '事务标题' }, date: { type: 'string', minLength: 10, description: '日期 YYYY-MM-DD' }, time: { type: 'string', description: '可选时间 HH:mm' } }, required: ['title', 'date'], additionalProperties: false }, capability: 'create', risk: 'medium', scope: 'none' },
      execute: (args, services) => requireService(services.createCalendarEvent, '日历写入')!(String(args.title), String(args.date), optionalText(args.time)),
    })
    .register({
      definition: { name: 'diary.append', description: '把内容追加到指定日期的日记；真正写入前必须由用户确认', inputSchema: { type: 'object', properties: { date: { type: 'string', minLength: 10, description: '日记日期 YYYY-MM-DD' }, title: { type: 'string', description: '仅在新建日记时使用的可选标题' }, content: { type: 'string', minLength: 1, description: '要追加的正文' } }, required: ['date', 'content'], additionalProperties: false }, capability: 'modify', risk: 'medium', scope: 'none' },
      execute: (args, services) => requireService(services.appendDiary, '日记写入')!(String(args.date), optionalText(args.title), String(args.content)),
    })
    .register({
      definition: { name: 'chapter.create', description: '在当前已授权作品中新建章节；真正写入前必须由用户确认', inputSchema: { type: 'object', properties: { title: { type: 'string', minLength: 1, description: '新章节标题' } }, required: ['title'], additionalProperties: false }, capability: 'create', risk: 'medium', scope: 'active_work' },
      execute: (args, services) => requireService(services.createChapter, '章节写入')!(String(args.title)),
    })
    .register({
      definition: { name: 'memory.save', description: '保存一条由用户明确要求记住的伙伴记忆；真正写入前必须由用户确认', inputSchema: { type: 'object', properties: { content: { type: 'string', minLength: 1, description: '要记住的内容' } }, required: ['content'], additionalProperties: false }, capability: 'create', risk: 'medium', scope: 'none' },
      execute: (args, services) => requireService(services.saveMemory, '伙伴记忆写入')!(String(args.content)),
    })
    .register({
      definition: { name: 'app.navigate', description: '切换到一隅中的指定页面', inputSchema: { type: 'object', properties: { view: { type: 'string', enum: ['home', 'calendar', 'todos', 'writing', 'diary', 'people', 'places', 'timeline', 'assets', 'music', 'settings'], description: '目标页面' } }, required: ['view'], additionalProperties: false }, capability: 'presentation', risk: 'low', scope: 'none' },
      execute: (args, services) => requireService(services.navigate, '页面切换')!(String(args.view)),
    })
    .register({
      definition: { name: 'music.control', description: '控制一隅音乐的播放暂停、上一首或下一首', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['play_pause', 'previous', 'next'], description: '播放控制动作' } }, required: ['action'], additionalProperties: false }, capability: 'presentation', risk: 'low', scope: 'none' },
      execute: (args, services) => requireService(services.controlMusic, '音乐控制')!(String(args.action)),
    })
  if (onVisualState) registry.register({
    definition: {
      name: 'companion.set_state',
      description: '为这次回应选择一个克制的伙伴视觉状态；仅在确有助于表达语气时调用一次',
      inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['idle', 'happy', 'concerned', 'surprised'], description: '伙伴视觉状态' } }, required: ['state'], additionalProperties: false },
      capability: 'presentation', risk: 'low', scope: 'none',
    },
    execute: (args) => { onVisualState(String(args.state) as CompanionVideoState); return { state: args.state } },
  })
  return registry
}
