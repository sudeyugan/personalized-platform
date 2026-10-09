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
  experiences: { id: 'experiences', view: 'experiences', description: '个人经历册与作品、足迹记录', readScope: 'experiences', destinations: ['experiences'], tools: ['experience.list', 'experience.get'] },
  fortune: { id: 'fortune', view: 'fortune', description: '本地今日、恋爱、前程签与临时客签', readScope: 'fortune', destinations: ['fortune'], tools: ['fortune.draw'] },
  home: { id: 'daily', view: 'home', description: '首页、朝问与情绪回望', readScope: 'mood', destinations: ['home', 'mood.reflection'], tools: ['mood.get_day', 'mood.get_summary', 'daily_question.list'] },
  answerBook: { id: 'answer-book', view: 'answerBook', description: '本地答案之书翻页与收藏查询', readScope: 'answer_book', destinations: ['answer_book'], tools: ['answer_book.draw', 'answer_book.list_favorites'] },
  truth: { id: 'truth', view: 'truth', description: '本地真心话抽卡（不收集回答）', readScope: 'truth', destinations: ['truth'], tools: ['truth.draw'] },
  calendar: { id: 'calendar', view: 'calendar', description: '日历、事务与课表', readScope: 'calendar', destinations: ['calendar.day', 'calendar.schedule'], tools: ['calendar.list_events', 'course.list', 'course.create', 'course.update'] },
  todos: { id: 'todos', view: 'todos', description: '待办与周期任务', readScope: 'todos', destinations: ['todos'], tools: ['todo.list'] },
  writing: { id: 'writing', view: 'writing', description: '作品与章节写作', readScope: 'chapters', destinations: ['writing.chapter'], tools: ['work.create', 'work.get_current', 'chapter.search', 'chapter.get'] },
  diary: { id: 'diary', view: 'diary', description: '日期日记', readScope: 'diary', destinations: ['diary.day'], tools: ['diary.search', 'diary.get'] },
  people: { id: 'people', view: 'people', description: '人物资料', readScope: 'records', destinations: ['record.person'], tools: ['character.search', 'record.get'] },
  places: { id: 'places', view: 'places', description: '地点资料', readScope: 'records', destinations: ['record.place'], tools: ['place.search', 'record.get'] },
  timeline: { id: 'timeline', view: 'timeline', description: '时间线资料', readScope: 'records', destinations: ['record.timeline'], tools: ['timeline.search', 'record.get'] },
  assets: { id: 'assets', view: 'assets', description: '本地创作素材元数据', readScope: 'assets', destinations: ['assets'], tools: ['asset.list'] },
  music: { id: 'music', view: 'music', description: '一隅本地曲库与播放控制（不是 QQ 系统伴听）', readScope: 'music', destinations: ['music'], tools: ['music.get_current', 'music.control'] },
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
