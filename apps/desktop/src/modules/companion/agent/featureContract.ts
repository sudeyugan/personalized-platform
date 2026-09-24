import type { ViewId } from '../../../domain/models'
import type { AgentToolScope } from './types'
import type { AgentToolRegistry } from './toolRegistry'

export interface AgentFeatureContract {
  id: string
  view: ViewId
  description: string
  readScope: AgentToolScope
  destinations: readonly string[]
  tools: readonly string[]
}

/**
 * Every application view must declare its Agent surface here. Keeping this as
 * Record<ViewId, ...> makes a newly added page a compile-time integration task
 * instead of an easy-to-forget follow-up.
 */
export const agentFeatureContracts: Record<ViewId, AgentFeatureContract> = {
  home: { id: 'daily', view: 'home', description: '首页、朝问与情绪回望', readScope: 'mood', destinations: ['home', 'mood.reflection'], tools: ['mood.get_day', 'mood.get_summary', 'daily_question.list'] },
  answerBook: { id: 'answer-book', view: 'answerBook', description: '答案之书收藏', readScope: 'answer_book', destinations: ['answer_book'], tools: ['answer_book.list_favorites'] },
  calendar: { id: 'calendar', view: 'calendar', description: '日历、事务与课表', readScope: 'calendar', destinations: ['calendar.day', 'calendar.schedule'], tools: ['calendar.list_events', 'course.list'] },
  todos: { id: 'todos', view: 'todos', description: '待办与周期任务', readScope: 'todos', destinations: ['todos'], tools: ['todo.list'] },
  writing: { id: 'writing', view: 'writing', description: '作品与章节写作', readScope: 'chapters', destinations: ['writing.chapter'], tools: ['work.get_current', 'chapter.search', 'chapter.get'] },
  diary: { id: 'diary', view: 'diary', description: '日期日记', readScope: 'diary', destinations: ['diary.day'], tools: ['diary.search', 'diary.get'] },
  people: { id: 'people', view: 'people', description: '人物资料', readScope: 'records', destinations: ['record.person'], tools: ['character.search', 'record.get'] },
  places: { id: 'places', view: 'places', description: '地点资料', readScope: 'records', destinations: ['record.place'], tools: ['place.search', 'record.get'] },
  timeline: { id: 'timeline', view: 'timeline', description: '时间线资料', readScope: 'records', destinations: ['record.timeline'], tools: ['timeline.search', 'record.get'] },
  assets: { id: 'assets', view: 'assets', description: '本地创作素材（不向伙伴开放）', readScope: 'none', destinations: ['assets'], tools: [] },
  music: { id: 'music', view: 'music', description: '音乐与播放状态', readScope: 'music', destinations: ['music'], tools: ['music.get_current'] },
  help: { id: 'help', view: 'help', description: '帮助中心', readScope: 'none', destinations: ['help'], tools: [] },
  settings: { id: 'settings', view: 'settings', description: '设置', readScope: 'none', destinations: ['settings'], tools: [] },
}

export const agentDestinations = Object.values(agentFeatureContracts).flatMap((feature) => feature.destinations)
export const agentFeatureIds = Object.values(agentFeatureContracts).map((feature) => feature.id)

export function viewForAgentDestination(destination: string): ViewId | undefined {
  return Object.values(agentFeatureContracts).find((feature) => feature.destinations.includes(destination))?.view
}

export function assertAgentFeatureContract(registry: AgentToolRegistry) {
  const missing = Object.values(agentFeatureContracts)
    .flatMap((feature) => feature.tools)
    .filter((name) => !registry.lookup(name))
  if (missing.length) throw new Error(`Agent feature contract is missing tools: ${[...new Set(missing)].join(', ')}`)
}
