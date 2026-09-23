import type { JSONContent } from '@tiptap/react'
import type { Course, CourseDay, LibraryData, MoodEntry, MoodKind, MoodPeriod, MoodPoints, TodoItem } from './models'
import { countChineseWords } from './wordCount'

const introContent: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: '写在开始之前' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '这里是只属于你的安静一隅。把记忆慢慢写下来，不必急着成为完整的故事。' },
      ],
    },
    {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '真正重要的故事，值得被温柔地保存。' }] }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: '从一个清晰的画面、一句话，或者一个人的名字开始吧。' }],
    },
  ],
}

const introText = '写在开始之前 这里是只属于你的安静一隅。把记忆慢慢写下来，不必急着成为完整的故事。真正重要的故事，值得被温柔地保存。从一个清晰的画面、一句话，或者一个人的名字开始吧。'

export const importedScheduleCourses: Course[] = [
  { id: 'course-import-mon-1-practice', title: '专业课程实践', day: 1, period: 1, teacher: '王朝坤', location: '', weeks: '全周', note: '必修' },
  { id: 'course-import-mon-3-film', title: '电影与政治', day: 1, period: 3, teacher: '张开平', location: '三教2101', weeks: '全周', note: '任选' },
  { id: 'course-import-mon-3-quantum', title: '量子力学（1）', day: 1, period: 3, teacher: '陈新', location: '五教5205', weeks: '全周', note: '必修' },
  { id: 'course-import-mon-4-film', title: '电影与政治', day: 1, period: 4, teacher: '张开平', location: '三教2101', weeks: '全周', note: '任选' },
  { id: 'course-import-tue-2-automata', title: '形式语言与自动机', day: 2, period: 2, teacher: '高跃', location: '五教5201', weeks: '全周', note: '任选' },
  { id: 'course-import-tue-3-data', title: '数据结构', day: 2, period: 3, teacher: '丁贵广', location: '舜德/经管西楼401', weeks: '全周', note: '必修' },
  { id: 'course-import-tue-4-data', title: '数据结构', day: 2, period: 4, teacher: '丁贵广', location: '舜德/经管西楼401', weeks: '全周', note: '必修' },
  { id: 'course-import-tue-6-economics', title: '经济学通论', day: 2, period: 6, teacher: '李稻葵', location: '大礼堂', weeks: '全周', note: '任选' },
  { id: 'course-import-wed-2-network', title: '计算机网络', day: 3, period: 2, teacher: '杨铮', location: '六教6A116', weeks: '全周', note: '必修' },
  { id: 'course-import-wed-3-quantum', title: '量子力学（1）', day: 3, period: 3, teacher: '陈新', location: '五教5205', weeks: '全周', note: '必修' },
  { id: 'course-import-wed-6-art', title: '影视艺术概论与作品赏析', day: 3, period: 6, teacher: '覃川', location: '蒙楼（艺教）多功能厅', weeks: '1-11周', note: '任选' },
  { id: 'course-import-thu-2-software', title: '软件工程', day: 4, period: 2, teacher: '刘璐', location: '二教403', weeks: '全周', note: '必修' },
  { id: 'course-import-fri-2-compiler', title: '汇编与编译原理', day: 5, period: 2, teacher: '王朝坤', location: '舜德/经管西楼418', weeks: '全周', note: '必修' },
]

const moodKinds: MoodKind[] = ['happy', 'excited', 'satisfied', 'hopeful', 'calm', 'relaxed', 'anxious', 'irritated', 'angry', 'sad', 'lonely', 'tired']
const isMoodKind = (value: unknown): value is MoodKind => typeof value === 'string' && moodKinds.includes(value as MoodKind)
const isMoodPeriod = (value: unknown): value is MoodPeriod => value === 'morning' || value === 'afternoon' || value === 'evening'
const periodFromTime = (value: unknown): MoodPeriod => {
  const hour = typeof value === 'string' ? new Date(value).getHours() : 12
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
}
const normalizeMoodEntries = (value: unknown): MoodEntry[] => {
  if (!Array.isArray(value)) return []
  const entries = new Map<string, MoodEntry>()
  value.forEach((item) => {
    if (!item || typeof item !== 'object') return
    const stored = item as Record<string, unknown>
    if (typeof stored.id !== 'string' || typeof stored.date !== 'string') return
    const createdAt = typeof stored.createdAt === 'string' ? stored.createdAt : new Date().toISOString()
    const period = isMoodPeriod(stored.period) ? stored.period : periodFromTime(createdAt)
    const points: MoodPoints = {}
    if (stored.points && typeof stored.points === 'object') {
      Object.entries(stored.points as Record<string, unknown>).forEach(([kind, count]) => {
        if (isMoodKind(kind) && typeof count === 'number' && count > 0) points[kind] = Math.min(5, Math.round(count))
      })
    } else if (isMoodKind(stored.mood)) {
      points[stored.mood] = 5
    }
    if (Object.values(points).reduce((sum, count) => sum + (count ?? 0), 0) !== 5) return
    const updatedAt = typeof stored.updatedAt === 'string' ? stored.updatedAt : createdAt
    const entry: MoodEntry = { id: stored.id, date: stored.date, period, points, createdAt, updatedAt, note: typeof stored.note === 'string' && stored.note.trim() ? stored.note.trim() : undefined }
    const key = `${entry.date}-${entry.period}`
    const previous = entries.get(key)
    if (!previous || previous.updatedAt.localeCompare(updatedAt) <= 0) entries.set(key, entry)
  })
  return [...entries.values()]
}

export function createSeedLibrary(): LibraryData {
  const now = new Date().toISOString()
  const chapterId = 'chapter-welcome'
  const workId = 'work-memoir'
  const wordCount = countChineseWords(introText)

  return {
    schemaVersion: 1,
    works: [{
      id: workId,
      kind: 'memoir',
      title: '我的回忆录',
      description: '把散落的时光，收进一处。',
      chapterIds: [chapterId],
      targetWords: 80000,
      createdAt: now,
      updatedAt: now,
    }],
    chapters: {
      [chapterId]: {
        id: chapterId,
        workId,
        title: '写在开始之前',
        content: introContent,
        plainText: introText,
        wordCount,
        revision: 1,
        status: 'draft',
        versions: [{
          id: 'version-welcome-1',
          revision: 1,
          content: introContent,
          plainText: introText,
          wordCount,
          reason: 'initial',
          label: '最初的版本',
          pinned: true,
          createdAt: now,
        }],
        updatedAt: now,
      },
    },
    volumes: [],
    people: [
      { id: 'person-1', name: '外婆', aliases: [], summary: '记忆里总在院中晒太阳的人。', importantExperiences: '', customFields: [], tags: ['家人'], chapterIds: [] },
      { id: 'person-2', name: '少年时的我', aliases: [], summary: '故事的讲述者，也是时间里的旅人。', importantExperiences: '', customFields: [], tags: ['自己'], chapterIds: [chapterId] },
    ],
    places: [
      { id: 'place-1', name: '旧院子', aliases: [], region: '故乡', address: '', relatedPeriod: '', description: '石阶、葡萄架和夏日午后的蝉鸣。', tags: [], customFields: [], chapterIds: [] },
    ],
    events: [
      { id: 'event-1', title: '搬离故乡', displayTime: '约 1998 年夏天', precision: 'approximate', sortTime: '1998-06-01', manualOrder: 0, description: '第一次意识到告别的分量。', customFields: [], chapterIds: [] },
    ],
    personRelations: [],
    entityLinks: [{ id: 'link-seed-1', sourceType: 'chapter', sourceId: chapterId, targetType: 'person', targetId: 'person-2', relationType: 'mentions', createdAt: now }],
    assets: [],
    aiGenerations: [],
    tracks: [],
    musicContexts: { global: [], works: {}, chapters: {}, focus: [] },
    companion: { name: '小隅', expression: 'calm', appearance: { hair: 'ink', outfit: 'linen' }, desktop: { visible: false, mode: 'quiet', visual: { type: 'portrait' }, videoAssets: {}, videoClips: {}, toggleShortcut: 'CommandOrControl+Alt+Y', quietShortcut: 'CommandOrControl+Alt+T' }, provider: { providerId: 'mock', endpoint: '', model: 'mock-companion-v1' }, voice: { stt: { providerId: 'none', endpoint: '', model: 'scribe_v2' }, tts: { providerId: 'none', endpoint: '', model: 'eleven_flash_v2_5', voice: '' }, autoSpeak: false, wakeEnabled: false, wakeWord: '小鱼', wakeSensitivity: 'standard', speakerVerification: true, modelDownloadSource: 'china', replyLength: 'short', longReplySpeech: 'summary' }, permissions: { workIds: [], chapterIds: [], records: false, musicContext: false, writeActions: false }, messages: [], memories: [], agentAudit: [], personality: { warmth: 60, curiosity: 50, initiative: 30 }, growth: { enabled: false, logs: [] } },
    planner: { courses: importedScheduleCourses.map((course) => ({ ...course })), diaryEntries: [], moodEntries: [], todos: [], holidayDates: [], dailyQuestions: [], calendarEvents: [], term: { startDate: '2026-09-14', totalWeeks: 16 }, courseImportVersion: 1 },
    answerBook: { favorites: [] },
    settings: {
      theme: 'warm',
      showRightPanel: true,
      compactNavigation: false,
      dailyTarget: 800,
      modules: [
        { id: 'writing', enabled: true, available: true },
        { id: 'music', enabled: true, available: true },
        { id: 'companion', enabled: true, available: true },
        { id: 'answerBook', enabled: true, available: true },
      ],
      layoutProfile: 'writing',
      navigationOrder: ['home', 'answerBook', 'calendar', 'todos', 'writing', 'diary', 'people', 'places', 'timeline', 'assets', 'music', 'help', 'settings'],
      backgrounds: { images: {}, sidebarMode: 'decoration' },
      ai: { providerId: 'mock', endpoint: '', model: 'mock-illustration-v1', stylePreset: '温暖手绘' },
      backup: { dailyEnabled: true, directory: '', retentionCount: 14 },
      security: { autoLockMinutes: 15 },
      trust: { externalAiProcessing: false, shareAuthorizedContext: true, shareRecentConversation: true, retainConversationHistory: true, outboundProtection: true, outboundReviewMode: 'balanced', privateDictionary: [] },
      music: { volume: 0.65, loop: 'all', autoSwitch: false, playerVisible: true },
    },
    session: {
      activeView: 'home',
      activeWorkId: workId,
      activeChapterId: chapterId,
      openChapterIds: [chapterId],
      focusMode: false,
      cursorByChapter: {},
      scrollByChapter: {},
    },
  }
}

export function normalizeLibrary(data: LibraryData): LibraryData {
  const seed = createSeedLibrary()
  const storedModules = data.settings.modules ?? []
  const modules = seed.settings.modules.map((defaultModule) => {
    const stored = storedModules.find((module) => module.id === defaultModule.id)
    const merged = stored ? { ...defaultModule, ...stored } : defaultModule
    return merged.id === 'music' || merged.id === 'companion' || merged.id === 'answerBook' ? { ...merged, available: true } : merged
  })
  const navigationOrder = [...new Set((data.settings.navigationOrder ?? seed.settings.navigationOrder).map((view) => (view as string) === 'journal' ? 'calendar' as const : view))]
  if (!navigationOrder.includes('assets')) navigationOrder.splice(Math.max(0, navigationOrder.indexOf('settings')), 0, 'assets')
  if (!navigationOrder.includes('help')) navigationOrder.splice(Math.max(0, navigationOrder.indexOf('settings')), 0, 'help')
  if (!navigationOrder.includes('music')) navigationOrder.splice(Math.max(0, navigationOrder.indexOf('help')), 0, 'music')
  if (!navigationOrder.includes('calendar')) navigationOrder.splice(1, 0, 'calendar')
  if (!navigationOrder.includes('answerBook')) navigationOrder.splice(Math.max(0, navigationOrder.indexOf('home') + 1), 0, 'answerBook')
  if (!navigationOrder.includes('diary')) navigationOrder.splice(Math.max(0, navigationOrder.indexOf('people')), 0, 'diary')
  if (!navigationOrder.includes('todos')) navigationOrder.splice(Math.max(2, navigationOrder.indexOf('writing')), 0, 'todos')
  const storedPlanner = data.planner ?? { courses: [], diaryEntries: [], moodEntries: [], todos: [], holidayDates: [], dailyQuestions: [], calendarEvents: [], term: seed.planner.term }
  const courses = storedPlanner.courseImportVersion === 1 ? storedPlanner.courses : [
    ...storedPlanner.courses,
    ...importedScheduleCourses.filter((candidate) => !storedPlanner.courses.some((course) => course.day === candidate.day && course.period === candidate.period && course.title === candidate.title)),
  ]
  const storedVideoAssets = data.companion?.desktop?.videoAssets ?? (data.companion?.desktop?.visual?.type === 'video' ? data.companion.desktop.visual.videos : {})
  const storedVideoClips = data.companion?.desktop?.videoClips ?? (data.companion?.desktop?.visual?.type === 'video' ? data.companion.desktop.visual.clips : undefined)
  const videoClips = Object.fromEntries([...new Set([...Object.keys(storedVideoAssets), ...Object.keys(storedVideoClips ?? {})])].map((state) => {
    const clips = storedVideoClips?.[state as keyof typeof storedVideoClips]?.filter(Boolean) ?? []
    const legacy = storedVideoAssets[state as keyof typeof storedVideoAssets]
    return [state, [...new Set(legacy && !clips.includes(legacy) ? [legacy, ...clips] : clips)]]
  }).filter(([, clips]) => (clips as string[]).length))
  const primaryVideos = Object.fromEntries(Object.entries(videoClips).map(([state, clips]) => [state, (clips as string[])[0]]))
  const storedVisual = data.companion?.desktop?.visual ?? { type: 'portrait' as const, assetId: data.companion?.appearance?.portraitAssetId }
  const normalizedVisual = storedVisual.type === 'video' ? { type: 'video' as const, videos: primaryVideos, clips: videoClips } : storedVisual
  return {
    ...data,
    volumes: data.volumes ?? [],
    people: (data.people ?? []).map((person) => ({ ...person, aliases: person.aliases ?? [], importantExperiences: person.importantExperiences ?? '', customFields: person.customFields ?? [] })),
    places: (data.places ?? []).map((place) => ({ ...place, aliases: place.aliases ?? [], address: place.address ?? '', relatedPeriod: place.relatedPeriod ?? '', tags: place.tags ?? [], customFields: place.customFields ?? [] })),
    events: (data.events ?? []).map((event, index) => ({ ...event, manualOrder: event.manualOrder ?? index, customFields: event.customFields ?? [] })),
    personRelations: data.personRelations ?? [],
    entityLinks: data.entityLinks ?? [],
    assets: data.assets ?? [],
    aiGenerations: data.aiGenerations ?? [],
    tracks: data.tracks ?? [],
    musicContexts: { ...seed.musicContexts, ...data.musicContexts, works: data.musicContexts?.works ?? {}, chapters: data.musicContexts?.chapters ?? {} },
    companion: { ...seed.companion, ...data.companion, appearance: { ...seed.companion.appearance, ...data.companion?.appearance }, desktop: { ...seed.companion.desktop, ...data.companion?.desktop, visual: normalizedVisual, videoAssets: primaryVideos, videoClips }, provider: { ...seed.companion.provider, ...data.companion?.provider }, voice: { ...seed.companion.voice, ...data.companion?.voice, stt: { ...seed.companion.voice.stt, ...data.companion?.voice?.stt }, tts: { ...seed.companion.voice.tts, ...data.companion?.voice?.tts } }, permissions: { ...seed.companion.permissions, ...data.companion?.permissions }, messages: data.companion?.messages ?? [], memories: data.companion?.memories ?? [], agentAudit: data.companion?.agentAudit ?? [], personality: { ...seed.companion.personality, ...data.companion?.personality }, growth: { ...seed.companion.growth, ...data.companion?.growth, logs: data.companion?.growth?.logs ?? [] } },
    answerBook: { favorites: data.answerBook?.favorites ?? [] },
    planner: {
      courses,
      diaryEntries: storedPlanner.diaryEntries,
      moodEntries: normalizeMoodEntries(storedPlanner.moodEntries),
      holidayDates: [...new Set(storedPlanner.holidayDates ?? [])],
      dailyQuestions: (storedPlanner.dailyQuestions ?? []).slice(-90),
      calendarEvents: storedPlanner.calendarEvents ?? [],
      term: storedPlanner.term ?? seed.planner.term,
      todos: storedPlanner.todos.map((todo) => {
        const legacyRepeat = todo.repeat as TodoItem['repeat']
        const repeat = legacyRepeat === 'weekdays' ? 'weekly' : legacyRepeat ?? 'none'
        const reference = todo.dueDate ? new Date(`${todo.dueDate}T12:00:00`) : new Date(todo.createdAt)
        const referenceDay = (reference.getDay() || 7) as CourseDay
        return { ...todo, repeat, repeatDays: todo.repeatDays ?? (legacyRepeat === 'weekdays' ? [1, 2, 3, 4, 5] : repeat === 'weekly' ? [referenceDay] : undefined), quotaPeriod: repeat === 'quota' ? todo.quotaPeriod ?? 'week' : undefined, quotaTarget: repeat === 'quota' ? Math.min(99, Math.max(1, todo.quotaTarget ?? 3)) : undefined, quotaCompletions: todo.quotaCompletions ?? [], completedDates: todo.completedDates ?? [] }
      }),
      courseImportVersion: 1,
    },
    works: data.works.map((work) => ({ ...work, volumeIds: work.volumeIds ?? [] })),
    settings: {
      ...seed.settings,
      ...data.settings,
      modules,
      layoutProfile: data.settings.layoutProfile ?? 'writing',
      navigationOrder,
      backgrounds: {
        ...seed.settings.backgrounds,
        ...data.settings.backgrounds,
        images: {
          ...seed.settings.backgrounds.images,
          ...(data.settings.backgrounds?.images ?? {}),
          default: data.settings.backgrounds?.images?.default ?? data.settings.backgroundImage,
        },
      },
      backgroundImage: undefined,
      ai: { ...seed.settings.ai, ...data.settings.ai },
      backup: { ...seed.settings.backup, ...data.settings.backup },
      security: { ...seed.settings.security, ...data.settings.security },
      trust: data.settings.trust
        ? { ...seed.settings.trust, ...data.settings.trust }
        : { ...seed.settings.trust, externalAiProcessing: data.companion?.provider?.providerId === 'deepseek' },
      music: { ...seed.settings.music, ...data.settings.music },
    },
    session: {
      ...seed.session,
      ...data.session,
      activeView: (data.session.activeView as string) === 'journal' ? 'calendar' : data.session.activeView,
      focusMode: data.session.focusMode ?? false,
      cursorByChapter: data.session.cursorByChapter ?? {},
      scrollByChapter: data.session.scrollByChapter ?? {},
    },
  }
}
