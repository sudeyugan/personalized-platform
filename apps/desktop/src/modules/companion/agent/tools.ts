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
      definition: { name: 'todo.update', description: '修改现有待办的标题、备注、日期或重要程度', inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1 }, title: { type: 'string' }, note: { type: 'string' }, dueDate: { type: 'string', description: 'YYYY-MM-DD；空字符串表示清除' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['id'], additionalProperties: false }, capability: 'modify', risk: 'medium', scope: 'none' },
      execute: (args, services) => requireService(services.updateTodo, '待办修改')!({ id: String(args.id), title: args.title as string | undefined, note: args.note as string | undefined, dueDate: args.dueDate as string | undefined, priority: args.priority as string | undefined }),
    })
    .register({
      definition: { name: 'todo.set_completed', description: '将待办在指定日期设为完成或未完成', inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1 }, date: { type: 'string', minLength: 10, description: 'YYYY-MM-DD' }, completed: { type: 'string', enum: ['true', 'false'] } }, required: ['id', 'date', 'completed'], additionalProperties: false }, capability: 'modify', risk: 'medium', scope: 'none' },
      execute: (args, services) => requireService(services.setTodoCompleted, '待办完成状态修改')!(String(args.id), String(args.date), args.completed === 'true'),
    })
    .register({
      definition: { name: 'calendar.create_event', description: '在日历中创建事务；真正写入前必须由用户确认', inputSchema: { type: 'object', properties: { title: { type: 'string', minLength: 1, description: '事务标题' }, date: { type: 'string', minLength: 10, description: '日期 YYYY-MM-DD' }, time: { type: 'string', description: '可选时间 HH:mm' } }, required: ['title', 'date'], additionalProperties: false }, capability: 'create', risk: 'medium', scope: 'none' },
      execute: (args, services) => requireService(services.createCalendarEvent, '日历写入')!(String(args.title), String(args.date), optionalText(args.time)),
    })
    .register({
      definition: { name: 'calendar.update_event', description: '修改现有日历事务', inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1 }, title: { type: 'string' }, date: { type: 'string' }, time: { type: 'string', description: 'HH:mm；空字符串表示清除' }, note: { type: 'string' } }, required: ['id'], additionalProperties: false }, capability: 'modify', risk: 'medium', scope: 'none' },
      execute: (args, services) => requireService(services.updateCalendarEvent, '日历事务修改')!({ id: String(args.id), title: args.title as string | undefined, date: args.date as string | undefined, time: args.time as string | undefined, note: args.note as string | undefined }),
    })
    .register({
      definition: { name: 'diary.append', description: '把内容追加到指定日期的日记；真正写入前必须由用户确认', inputSchema: { type: 'object', properties: { date: { type: 'string', minLength: 10, description: '日记日期 YYYY-MM-DD' }, title: { type: 'string', description: '仅在新建日记时使用的可选标题' }, content: { type: 'string', minLength: 1, description: '要追加的正文' } }, required: ['date', 'content'], additionalProperties: false }, capability: 'modify', risk: 'medium', scope: 'none' },
      execute: (args, services) => requireService(services.appendDiary, '日记写入')!(String(args.date), optionalText(args.title), String(args.content)),
    })
    .register({
      definition: { name: 'diary.write', description: '新建或完整改写指定日期的日记；会替换该日原正文', inputSchema: { type: 'object', properties: { date: { type: 'string', minLength: 10, description: 'YYYY-MM-DD' }, title: { type: 'string', minLength: 1 }, content: { type: 'string', minLength: 1 } }, required: ['date', 'title', 'content'], additionalProperties: false }, capability: 'modify', risk: 'medium', scope: 'none' },
      execute: (args, services) => requireService(services.writeDiary, '日记改写')!(String(args.date), String(args.title), String(args.content)),
    })
    .register({
      definition: { name: 'work.create', description: '创建一个新作品并将其设为当前作品', inputSchema: { type: 'object', properties: { title: { type: 'string', minLength: 1 } }, required: ['title'], additionalProperties: false }, capability: 'create', risk: 'medium', scope: 'none' },
      execute: (args, services) => requireService(services.createWork, '作品创建')!(String(args.title)),
    })
    .register({
      definition: { name: 'work.rename_current', description: '重命名当前已授权作品', inputSchema: { type: 'object', properties: { title: { type: 'string', minLength: 1 } }, required: ['title'], additionalProperties: false }, capability: 'modify', risk: 'medium', scope: 'active_work' },
      execute: (args, services) => requireService(services.renameCurrentWork, '作品修改')!(String(args.title)),
    })
    .register({
      definition: { name: 'chapter.create', description: '在当前已授权作品中新建章节；真正写入前必须由用户确认', inputSchema: { type: 'object', properties: { title: { type: 'string', minLength: 1, description: '新章节标题' } }, required: ['title'], additionalProperties: false }, capability: 'create', risk: 'medium', scope: 'active_work' },
      execute: (args, services) => requireService(services.createChapter, '章节写入')!(String(args.title)),
    })
    .register({
      definition: { name: 'chapter.rename', description: '重命名一个已授权章节', inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1 }, title: { type: 'string', minLength: 1 } }, required: ['id', 'title'], additionalProperties: false }, capability: 'modify', risk: 'medium', scope: 'chapters' },
      execute: (args, services) => requireService(services.renameChapter, '章节修改')!(String(args.id), String(args.title)),
    })
    .register({
      definition: { name: 'chapter.append', description: '在已授权章节末尾追加正文，不覆盖原有内容', inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1 }, content: { type: 'string', minLength: 1 } }, required: ['id', 'content'], additionalProperties: false }, capability: 'modify', risk: 'medium', scope: 'chapters' },
      execute: (args, services) => requireService(services.appendChapter, '章节正文写入')!(String(args.id), String(args.content)),
    })
    .register({
      definition: { name: 'record.create', description: '创建人物、地点或时间线事件资料', inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['character', 'place', 'timeline'] }, name: { type: 'string', minLength: 1 }, description: { type: 'string' }, time: { type: 'string', description: '仅时间线事件使用的显示时间' } }, required: ['type', 'name'], additionalProperties: false }, capability: 'create', risk: 'medium', scope: 'records' },
      execute: (args, services) => requireService(services.createRecord, '资料创建')!({ type: String(args.type), name: String(args.name), description: args.description as string | undefined, time: args.time as string | undefined }),
    })
    .register({
      definition: { name: 'record.update', description: '修改人物、地点或时间线事件的名称与主要描述', inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['character', 'place', 'timeline'] }, id: { type: 'string', minLength: 1 }, name: { type: 'string' }, description: { type: 'string' }, time: { type: 'string' } }, required: ['type', 'id'], additionalProperties: false }, capability: 'modify', risk: 'medium', scope: 'records' },
      execute: (args, services) => requireService(services.updateRecord, '资料修改')!({ type: String(args.type), id: String(args.id), name: args.name as string | undefined, description: args.description as string | undefined, time: args.time as string | undefined }),
    })
    .register({
      definition: { name: 'course.create', description: '在课表中创建一门课程', inputSchema: { type: 'object', properties: { title: { type: 'string', minLength: 1 }, day: { type: 'string', enum: ['1', '2', '3', '4', '5', '6', '7'], description: '星期一到星期日' }, period: { type: 'string', enum: ['1', '2', '3', '4', '5', '6'] }, teacher: { type: 'string' }, location: { type: 'string' }, weeks: { type: 'string' }, note: { type: 'string' } }, required: ['title', 'day', 'period'], additionalProperties: false }, capability: 'create', risk: 'medium', scope: 'none' },
      execute: (args, services) => requireService(services.createCourse, '课程创建')!({ title: String(args.title), day: Number(args.day), period: Number(args.period), teacher: args.teacher as string | undefined, location: args.location as string | undefined, weeks: args.weeks as string | undefined, note: args.note as string | undefined }),
    })
    .register({
      definition: { name: 'course.update', description: '修改课表中现有课程', inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1 }, title: { type: 'string' }, day: { type: 'string', enum: ['1', '2', '3', '4', '5', '6', '7'] }, period: { type: 'string', enum: ['1', '2', '3', '4', '5', '6'] }, teacher: { type: 'string' }, location: { type: 'string' }, weeks: { type: 'string' }, note: { type: 'string' } }, required: ['id'], additionalProperties: false }, capability: 'modify', risk: 'medium', scope: 'none' },
      execute: (args, services) => requireService(services.updateCourse, '课程修改')!({ id: String(args.id), title: args.title as string | undefined, day: args.day === undefined ? undefined : Number(args.day), period: args.period === undefined ? undefined : Number(args.period), teacher: args.teacher as string | undefined, location: args.location as string | undefined, weeks: args.weeks as string | undefined, note: args.note as string | undefined }),
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
      inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['idle', 'happy', 'concerned', 'surprised', 'shy', 'sad', 'annoyed', 'greeting', 'agreeing', 'celebrating', 'stretching', 'sleepy'], description: '伙伴表情或姿势状态' } }, required: ['state'], additionalProperties: false },
      capability: 'presentation', risk: 'low', scope: 'none',
    },
    execute: (args) => { onVisualState(String(args.state) as CompanionVideoState); return { state: args.state } },
  })
  return registry
}
