import type { JSONContent } from '@tiptap/react'
import type { CompanionVideoState, CourseDay, CoursePeriod, MoodKind, MoodPeriod } from '../../domain/models'
import { createCompanionProvider } from '../../infrastructure/companionProvider'
import { searchWeb } from '../../infrastructure/webSearch'
import { createComputerService } from '../../infrastructure/computerService'
import { useLibraryStore } from '../../state/useLibraryStore'
import { applyContextPrivacy, applyHistoryPrivacy, assertExternalAiAllowed } from '../trust/trustPolicy'
import { createPrivacyProtectedProvider, protectOutboundText, type PrivacyReviewRequest } from '../privacy'
import { AgentPermissionEngine, buildAgentAccess, buildAgentContext, createAgentApplicationServices, createCompanionToolRegistry, runAgent } from './agent'
import type { AgentPermissionRequest, AgentRuntimeStatus } from './agent/types'

export interface CompanionTurnOptions {
  onStatus?: (status?: AgentRuntimeStatus) => void
  onTextDelta?: (delta: string) => void
  onVisualState?: (state: CompanionVideoState) => void
  requestPermission?: (request: AgentPermissionRequest) => Promise<boolean>
  requestPrivacyReview?: (request: PrivacyReviewRequest) => Promise<boolean>
  inputMode?: 'text' | 'voice'
  voiceReplyLength?: 'short' | 'standard'
  signal?: AbortSignal
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/
const clockTime = /^([01]\d|2[0-3]):[0-5]\d$/
const today = () => {
  const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

const cleanOptional = (value?: string) => value?.trim() || undefined
const requireDate = (value: string, label = '日期') => {
  if (!isoDate.test(value)) throw new Error(`${label}必须使用 YYYY-MM-DD`)
  return value
}
const requireClock = (value?: string) => {
  if (value && !clockTime.test(value)) throw new Error('时间必须使用 HH:mm')
  return cleanOptional(value)
}
const paragraphs = (text: string): JSONContent[] => text.trim().split(/\n{2,}/).map((value) => ({
  type: 'paragraph',
  content: value ? [{ type: 'text', text: value }] : undefined,
}))

export async function sendCompanionTurn(message: string, options: CompanionTurnOptions = {}) {
  const clean = message.trim()
  if (!clean) throw new Error('请输入想说的话')
  const store = useLibraryStore.getState()
  const { data, temporaryCompanionWorkIds } = store
  const access = buildAgentAccess(data, temporaryCompanionWorkIds)
  assertExternalAiAllowed(data.companion.provider.providerId, data.settings.trust, 'companion')
  const context = applyContextPrivacy(buildAgentContext(data, access), data.settings.trust)
  const services = createAgentApplicationServices(data, access, {
    createTodo: (title, dueDate) => {
      const date = dueDate ?? today()
      if (!isoDate.test(date)) throw new Error('待办日期必须使用 YYYY-MM-DD')
      useLibraryStore.getState().addTodo({ title, repeat: 'none', dueDate: date, repeatDays: undefined, quotaPeriod: undefined, quotaTarget: undefined })
      return { created: true, title: title.trim(), dueDate: date }
    },
    updateTodo: ({ id, title, note, dueDate, priority }) => {
      const current = useLibraryStore.getState()
      const todo = current.data.planner.todos.find((item) => item.id === id)
      if (!todo) throw new Error('找不到这条待办')
      if (dueDate) requireDate(dueDate, '待办日期')
      if (priority && !['low', 'medium', 'high'].includes(priority)) throw new Error('重要程度必须是 low、medium 或 high')
      current.updateTodo(id, {
        ...(cleanOptional(title) ? { title: title!.trim() } : {}),
        ...(note !== undefined ? { note: note.trim() } : {}),
        ...(dueDate !== undefined ? { dueDate: cleanOptional(dueDate) } : {}),
        ...(priority ? { priority: priority as 'low' | 'medium' | 'high' } : {}),
      })
      return { updated: true, id }
    },
    setTodoCompleted: (id, date, completed) => {
      requireDate(date, '完成日期')
      const current = useLibraryStore.getState()
      const todo = current.data.planner.todos.find((item) => item.id === id)
      if (!todo) throw new Error('找不到这条待办')
      const isCompleted = !todo.repeat || todo.repeat === 'none' ? todo.completed : (todo.completedDates ?? []).includes(date)
      if (isCompleted !== completed) current.toggleTodoForDate(id, date)
      return { updated: true, id, date, completed }
    },
    setTodoHoliday: (date, holiday) => {
      requireDate(date, '休假日期')
      const current = useLibraryStore.getState()
      const isHoliday = current.data.planner.holidayDates.includes(date)
      if (isHoliday !== holiday) current.toggleTodoHoliday(date)
      return { updated: true, date, holiday }
    },
    createCalendarEvent: (title, date, time) => {
      if (!isoDate.test(date)) throw new Error('日历日期必须使用 YYYY-MM-DD')
      if (time && !clockTime.test(time)) throw new Error('事务时间必须使用 HH:mm')
      useLibraryStore.getState().addCalendarEvent({ title, date, time })
      return { created: true, title: title.trim(), date, time }
    },
    updateCalendarEvent: ({ id, title, date, time, note }) => {
      const current = useLibraryStore.getState()
      if (!current.data.planner.calendarEvents.some((event) => event.id === id)) throw new Error('找不到这个日历事务')
      if (date) requireDate(date)
      current.updateCalendarEvent(id, {
        ...(cleanOptional(title) ? { title: title!.trim() } : {}),
        ...(date ? { date } : {}),
        ...(time !== undefined ? { time: requireClock(time) } : {}),
        ...(note !== undefined ? { note: cleanOptional(note) } : {}),
      })
      return { updated: true, id }
    },
    appendDiary: (date, title, content) => {
      if (!isoDate.test(date)) throw new Error('日记日期必须使用 YYYY-MM-DD')
      const current = useLibraryStore.getState()
      const existing = current.data.planner.diaryEntries.find((entry) => entry.date === date)
      const appended = [existing?.content.trim(), content.trim()].filter(Boolean).join('\n\n')
      current.saveDiaryEntry({ date, title: existing?.title || title?.trim() || `日记 · ${date}`, content: appended, updatedAt: new Date().toISOString() })
      return { saved: true, date, appendedCharacters: content.trim().length }
    },
    writeDiary: (date, title, content) => {
      requireDate(date, '日记日期')
      useLibraryStore.getState().saveDiaryEntry({ date, title: title.trim(), content: content.trim(), updatedAt: new Date().toISOString() })
      return { saved: true, date, characters: content.trim().length }
    },
    saveMood: (date, period, pointsJson, note) => {
      requireDate(date, '情绪日期')
      if (!['morning', 'afternoon', 'evening'].includes(period)) throw new Error('情绪时段无效')
      const allowed = new Set<MoodKind>(['happy', 'satisfied', 'hopeful', 'relaxed', 'calm', 'empty', 'anxious', 'irritated', 'angry', 'sad', 'lonely', 'tired'])
      let raw: unknown
      try { raw = JSON.parse(pointsJson) } catch { throw new Error('情绪点必须是有效 JSON') }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('情绪点必须是对象')
      const points = Object.fromEntries(Object.entries(raw).map(([kind, count]) => {
        if (!allowed.has(kind as MoodKind) || typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 5) throw new Error('情绪名称或点数无效')
        return [kind, count]
      })) as Partial<Record<MoodKind, number>>
      if (Object.values(points).reduce((sum, count) => sum + (count ?? 0), 0) !== 5) throw new Error('情绪点合计必须为 5')
      useLibraryStore.getState().saveMoodEntry({ date, period: period as MoodPeriod, points, note })
      return { saved: true, date, period }
    },
    createWork: (title) => {
      useLibraryStore.getState().createWork()
      const current = useLibraryStore.getState()
      const id = current.data.session.activeWorkId
      if (!id) throw new Error('作品创建失败')
      current.renameWork(id, title)
      return { created: true, id, title: title.trim() }
    },
    renameCurrentWork: (title) => {
      const current = useLibraryStore.getState()
      const id = current.data.session.activeWorkId
      if (!id) throw new Error('当前没有作品')
      current.renameWork(id, title)
      return { updated: true, id, title: title.trim() }
    },
    createChapter: (title) => {
      const current = useLibraryStore.getState()
      current.createChapter()
      const createdId = useLibraryStore.getState().data.session.activeChapterId
      if (!createdId) throw new Error('当前没有可写入的作品')
      useLibraryStore.getState().renameChapter(createdId, title)
      return { created: true, id: createdId, title: title.trim() }
    },
    renameChapter: (id, title) => {
      const current = useLibraryStore.getState()
      if (!current.data.chapters[id] || current.data.chapters[id].deletedAt) throw new Error('找不到这个章节')
      current.renameChapter(id, title)
      return { updated: true, id, title: title.trim() }
    },
    appendChapter: async (id, content) => {
      const current = useLibraryStore.getState()
      const chapter = current.data.chapters[id]
      if (!chapter || chapter.deletedAt) throw new Error('找不到这个章节')
      const nextText = [chapter.plainText.trim(), content.trim()].filter(Boolean).join('\n\n')
      const nextContent: JSONContent = { ...chapter.content, content: [...(chapter.content.content ?? []), ...paragraphs(content)] }
      await current.saveChapter(id, nextContent, nextText)
      return { updated: true, id, appendedCharacters: content.trim().length }
    },
    createRecord: ({ type, name, description, time }) => {
      const current = useLibraryStore.getState()
      if (type === 'character') {
        current.addPerson(); const record = useLibraryStore.getState().data.people.at(-1)
        if (!record) throw new Error('人物创建失败')
        useLibraryStore.getState().updatePerson(record.id, { ...record, name: name.trim(), summary: cleanOptional(description) ?? '' })
        return { created: true, type, id: record.id }
      }
      if (type === 'place') {
        current.addPlace(); const record = useLibraryStore.getState().data.places.at(-1)
        if (!record) throw new Error('地点创建失败')
        useLibraryStore.getState().updatePlace(record.id, { ...record, name: name.trim(), description: cleanOptional(description) ?? '' })
        return { created: true, type, id: record.id }
      }
      current.addEvent(); const record = useLibraryStore.getState().data.events.at(-1)
      if (!record) throw new Error('事件创建失败')
      useLibraryStore.getState().updateEvent(record.id, { ...record, title: name.trim(), description: cleanOptional(description) ?? '', displayTime: cleanOptional(time) ?? '时间待定' })
      return { created: true, type: 'timeline', id: record.id }
    },
    updateRecord: ({ type, id, name, description, time }) => {
      const current = useLibraryStore.getState()
      if (type === 'character') {
        const record = current.data.people.find((item) => item.id === id && !item.deletedAt); if (!record) throw new Error('找不到这个人物')
        current.updatePerson(id, { ...record, ...(cleanOptional(name) ? { name: name!.trim() } : {}), ...(description !== undefined ? { summary: description.trim() } : {}) })
      } else if (type === 'place') {
        const record = current.data.places.find((item) => item.id === id && !item.deletedAt); if (!record) throw new Error('找不到这个地点')
        current.updatePlace(id, { ...record, ...(cleanOptional(name) ? { name: name!.trim() } : {}), ...(description !== undefined ? { description: description.trim() } : {}) })
      } else {
        const record = current.data.events.find((item) => item.id === id && !item.deletedAt); if (!record) throw new Error('找不到这个事件')
        current.updateEvent(id, { ...record, ...(cleanOptional(name) ? { title: name!.trim() } : {}), ...(description !== undefined ? { description: description.trim() } : {}), ...(time !== undefined ? { displayTime: time.trim() } : {}) })
      }
      return { updated: true, type, id }
    },
    createCourse: ({ title, day, period, teacher, location, weeks, note }) => {
      if (day < 1 || day > 7 || period < 1 || period > 6) throw new Error('课程星期应为 1–7，节次应为 1–6')
      useLibraryStore.getState().addCourse({ title: title.trim(), day: day as CourseDay, period: period as CoursePeriod, teacher: cleanOptional(teacher) ?? '', location: cleanOptional(location) ?? '', weeks: cleanOptional(weeks) ?? '全周', note: cleanOptional(note) ?? '' })
      const id = useLibraryStore.getState().data.planner.courses.at(-1)?.id
      return { created: true, id }
    },
    updateCourse: ({ id, title, day, period, teacher, location, weeks, note }) => {
      const current = useLibraryStore.getState()
      if (!current.data.planner.courses.some((course) => course.id === id)) throw new Error('找不到这门课程')
      if ((day !== undefined && (day < 1 || day > 7)) || (period !== undefined && (period < 1 || period > 6))) throw new Error('课程星期应为 1–7，节次应为 1–6')
      current.updateCourse(id, { ...(cleanOptional(title) ? { title: title!.trim() } : {}), ...(day ? { day: day as CourseDay } : {}), ...(period ? { period: period as CoursePeriod } : {}), ...(teacher !== undefined ? { teacher: teacher.trim() } : {}), ...(location !== undefined ? { location: location.trim() } : {}), ...(weeks !== undefined ? { weeks: weeks.trim() } : {}), ...(note !== undefined ? { note: note.trim() } : {}) })
      return { updated: true, id }
    },
    saveMemory: (content) => {
      const saved = useLibraryStore.getState().addCompanionMemory(content, 'manual', 'AI 伙伴确认写入')
      if (!saved) throw new Error('这条记忆无法保存；加密作品内容不会写入普通记忆')
      return { saved: true }
    },
    openDestination: (input) => {
      useLibraryStore.getState().openAgentDestination({
        destination: input.destination,
        date: input.date,
        range: input.range === 'week' || input.range === 'month' ? input.range : undefined,
        targetId: input.targetId,
        filter: input.filter,
        section: input.section,
      })
      return { opened: input.destination, ...input }
    },
    controlMusic: (action) => {
      const current = useLibraryStore.getState()
      if (action === 'next') current.nextTrack()
      else if (action === 'previous') current.previousTrack()
      else current.togglePlayback()
      return { action }
    },
    computer: createComputerService(data.companion.computer),
    searchWeb: async (query) => searchWeb(await protectOutboundText(query, {
      trust: data.settings.trust,
      destination: data.settings.webSearch.providerId === 'tencent' ? '腾讯云联网搜索' : data.settings.webSearch.providerId === 'bocha' ? '博查联网搜索' : 'Bing Search',
      purpose: '联网查询',
      requestReview: options.requestPrivacyReview,
    }), data.settings.webSearch),
  })
  const registry = createCompanionToolRegistry(options.onVisualState)
  const permissions = new AgentPermissionEngine({
    policy: { autoAllow: ['read', 'presentation'] },
    resourcePermissions: data.companion.permissions,
    computer: data.companion.computer,
    access,
  })
  const contextSummary = [context.activeWork?.title, context.activeChapter?.title].filter(Boolean).join('、') || '未授权作品或章节'
  const history = applyHistoryPrivacy(data.companion.messages.slice(-8).map((item) => ({
    role: item.role === 'companion' ? 'assistant' as const : 'user' as const,
    content: item.content,
  })), data.settings.trust)
  let thinkingTimer: ReturnType<typeof setTimeout> | undefined
  let streamingResponse = false
  const forwardStatus = (status?: AgentRuntimeStatus) => {
    globalThis.clearTimeout(thinkingTimer)
    thinkingTimer = undefined
    if (!status) {
      options.onStatus?.(undefined)
      return
    }
    if (status.phase === 'thinking') {
      streamingResponse = false
      thinkingTimer = globalThis.setTimeout(() => options.onStatus?.(status), 400)
      return
    }
    options.onStatus?.(status)
  }
  if (data.settings.trust.retainConversationHistory) store.addCompanionMessage({ id: `message-${crypto.randomUUID()}`, role: 'user', content: clean, createdAt: new Date().toISOString(), contextSummary })
  try {
    const result = await runAgent({
      message: clean,
      history,
      context,
      provider: createPrivacyProtectedProvider(createCompanionProvider(data.companion.provider), {
        trust: data.settings.trust,
        destination: data.companion.provider.providerId === 'deepseek' ? 'DeepSeek' : data.companion.provider.providerId,
        purpose: 'AI 伙伴对话',
        requestReview: options.requestPrivacyReview,
      }),
      registry,
      permissions,
      services,
      onStatus: forwardStatus,
      onTextDelta: (delta) => {
        if (!streamingResponse) {
          streamingResponse = true
          forwardStatus({ phase: 'responding' })
        }
        options.onTextDelta?.(delta)
      },
      onAudit: (entry) => useLibraryStore.getState().addCompanionAudit([entry]),
      requestPermission: options.requestPermission,
      responseMode: options.inputMode ?? 'text',
      voiceReplyLength: options.voiceReplyLength,
      signal: options.signal,
    })
    if (data.settings.trust.retainConversationHistory) useLibraryStore.getState().addCompanionMessage({ id: `message-${crypto.randomUUID()}`, role: 'companion', content: result.text, createdAt: new Date().toISOString(), contextSummary })
    return result.text
  } finally {
    globalThis.clearTimeout(thinkingTimer)
    options.onStatus?.(undefined)
  }
}
