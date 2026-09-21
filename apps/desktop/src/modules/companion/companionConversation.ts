import type { CompanionVideoState, ViewId } from '../../domain/models'
import { createCompanionProvider } from '../../infrastructure/companionProvider'
import { useLibraryStore } from '../../state/useLibraryStore'
import { AgentPermissionEngine, buildAgentAccess, buildAgentContext, createAgentApplicationServices, createCompanionToolRegistry, runAgent } from './agent'
import type { AgentPermissionRequest, AgentRuntimeStatus } from './agent/types'

export interface CompanionTurnOptions {
  onStatus?: (status?: AgentRuntimeStatus) => void
  onTextDelta?: (delta: string) => void
  onVisualState?: (state: CompanionVideoState) => void
  requestPermission?: (request: AgentPermissionRequest) => Promise<boolean>
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

export async function sendCompanionTurn(message: string, options: CompanionTurnOptions = {}) {
  const clean = message.trim()
  if (!clean) throw new Error('请输入想说的话')
  const store = useLibraryStore.getState()
  const { data, temporaryCompanionWorkIds } = store
  const access = buildAgentAccess(data, temporaryCompanionWorkIds)
  const context = buildAgentContext(data, access)
  const services = createAgentApplicationServices(data, access, {
    createTodo: (title, dueDate) => {
      const date = dueDate ?? today()
      if (!isoDate.test(date)) throw new Error('待办日期必须使用 YYYY-MM-DD')
      useLibraryStore.getState().addTodo({ title, repeat: 'none', dueDate: date, repeatDays: undefined, quotaPeriod: undefined, quotaTarget: undefined })
      return { created: true, title: title.trim(), dueDate: date }
    },
    createCalendarEvent: (title, date, time) => {
      if (!isoDate.test(date)) throw new Error('日历日期必须使用 YYYY-MM-DD')
      if (time && !clockTime.test(time)) throw new Error('事务时间必须使用 HH:mm')
      useLibraryStore.getState().addCalendarEvent({ title, date, time })
      return { created: true, title: title.trim(), date, time }
    },
    appendDiary: (date, title, content) => {
      if (!isoDate.test(date)) throw new Error('日记日期必须使用 YYYY-MM-DD')
      const current = useLibraryStore.getState()
      const existing = current.data.planner.diaryEntries.find((entry) => entry.date === date)
      const appended = [existing?.content.trim(), content.trim()].filter(Boolean).join('\n\n')
      current.saveDiaryEntry({ date, title: existing?.title || title?.trim() || `日记 · ${date}`, content: appended, updatedAt: new Date().toISOString() })
      return { saved: true, date, appendedCharacters: content.trim().length }
    },
    createChapter: (title) => {
      const current = useLibraryStore.getState()
      current.createChapter()
      const createdId = useLibraryStore.getState().data.session.activeChapterId
      if (!createdId) throw new Error('当前没有可写入的作品')
      useLibraryStore.getState().renameChapter(createdId, title)
      return { created: true, id: createdId, title: title.trim() }
    },
    saveMemory: (content) => {
      const saved = useLibraryStore.getState().addCompanionMemory(content, 'manual', 'AI 伙伴确认写入')
      if (!saved) throw new Error('这条记忆无法保存；加密作品内容不会写入普通记忆')
      return { saved: true }
    },
    navigate: (view) => {
      useLibraryStore.getState().navigate(view as ViewId)
      return { opened: view }
    },
    controlMusic: (action) => {
      const current = useLibraryStore.getState()
      if (action === 'next') current.nextTrack()
      else if (action === 'previous') current.previousTrack()
      else current.togglePlayback()
      return { action }
    },
  })
  const registry = createCompanionToolRegistry(options.onVisualState)
  const permissions = new AgentPermissionEngine({
    policy: { autoAllow: ['read', 'presentation'] },
    resourcePermissions: data.companion.permissions,
    access,
  })
  const contextSummary = [context.activeWork?.title, context.activeChapter?.title].filter(Boolean).join('、') || '未授权作品或章节'
  const history = data.companion.messages.slice(-8).map((item) => ({
    role: item.role === 'companion' ? 'assistant' as const : 'user' as const,
    content: item.content,
  }))
  store.addCompanionMessage({ id: `message-${crypto.randomUUID()}`, role: 'user', content: clean, createdAt: new Date().toISOString(), contextSummary })
  try {
    const result = await runAgent({
      message: clean,
      history,
      context,
      provider: createCompanionProvider(data.companion.provider),
      registry,
      permissions,
      services,
      onStatus: (status) => options.onStatus?.(status),
      onTextDelta: options.onTextDelta,
      onAudit: (entry) => useLibraryStore.getState().addCompanionAudit([entry]),
      requestPermission: options.requestPermission,
      responseMode: options.inputMode ?? 'text',
      voiceReplyLength: options.voiceReplyLength,
      signal: options.signal,
    })
    useLibraryStore.getState().addCompanionMessage({ id: `message-${crypto.randomUUID()}`, role: 'companion', content: result.text, createdAt: new Date().toISOString(), contextSummary })
    return result.text
  } finally {
    options.onStatus?.(undefined)
  }
}
