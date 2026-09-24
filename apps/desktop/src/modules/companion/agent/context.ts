import type { LibraryData } from '../../../domain/models'
import type { AgentDataAccess } from './applicationServices'
import type { AgentContextSnapshot } from './types'
import { agentFeatureIds } from './featureContract'

export interface AgentAccessSnapshot extends AgentDataAccess {
  activeWorkAllowed: boolean
}

export function buildAgentAccess(data: LibraryData, temporaryWorkIds: string[]): AgentAccessSnapshot {
  const grantedWorks = new Set(data.companion.permissions.workIds)
  const grantedChapters = new Set(data.companion.permissions.chapterIds)
  const workIds = new Set<string>()
  const chapterIds = new Set<string>()

  data.works.forEach((work) => {
    const encryptedAllowed = !work.encrypted || (!work.locked && temporaryWorkIds.includes(work.id))
    if (!work.deletedAt && encryptedAllowed && (grantedWorks.has(work.id) || work.chapterIds.some((id) => grantedChapters.has(id)))) workIds.add(work.id)
  })
  Object.values(data.chapters).forEach((chapter) => {
    if (!chapter.deletedAt && workIds.has(chapter.workId) && (grantedWorks.has(chapter.workId) || grantedChapters.has(chapter.id))) chapterIds.add(chapter.id)
  })
  return {
    workIds,
    chapterIds,
    records: data.companion.permissions.records,
    todos: data.companion.permissions.todos,
    calendar: data.companion.permissions.calendar,
    courses: data.companion.permissions.courses,
    dailyQuestions: data.companion.permissions.dailyQuestions,
    diary: data.companion.permissions.diary,
    mood: data.companion.permissions.mood,
    memories: data.companion.permissions.memories,
    answerBook: data.companion.permissions.answerBook,
    music: data.companion.permissions.musicContext,
    internet: data.companion.permissions.internet,
    activeWorkAllowed: workIds.has(data.session.activeWorkId),
  }
}

function beijingTime(now: Date): AgentContextSnapshot['localTime'] {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  const hour = Number(parts.hour)
  const period = hour < 6 ? '凌晨' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 18 ? '下午' : hour < 23 ? '晚上' : '深夜'
  return {
    timeZone: 'Asia/Shanghai',
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    weekday: parts.weekday,
    period,
  }
}

export function buildAgentContext(data: LibraryData, access: AgentAccessSnapshot, selection?: string, now = new Date()): AgentContextSnapshot {
  const work = access.activeWorkAllowed ? data.works.find((item) => item.id === data.session.activeWorkId) : undefined
  const chapter = access.chapterIds.has(data.session.activeChapterId) ? data.chapters[data.session.activeChapterId] : undefined
  return {
    page: data.session.activeView,
    companion: { name: data.companion.name },
    localTime: beijingTime(now),
    activeWork: work ? { id: work.id, title: work.title } : undefined,
    activeChapter: chapter ? { id: chapter.id, title: chapter.title } : undefined,
    selection: selection?.trim() || undefined,
    availableFeatures: agentFeatureIds,
    navigation: data.session.agentNavigation ? {
      destination: data.session.agentNavigation.destination,
      date: data.session.agentNavigation.date,
      range: data.session.agentNavigation.range,
      targetId: data.session.agentNavigation.targetId,
    } : undefined,
  }
}
