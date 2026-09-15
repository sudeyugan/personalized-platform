import type { JSONContent } from '@tiptap/react'

export type ThemeId = 'warm' | 'light' | 'dark'
export type ViewId = 'home' | 'calendar' | 'todos' | 'writing' | 'diary' | 'people' | 'places' | 'timeline' | 'assets' | 'music' | 'help' | 'settings'
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
export type EntityType = 'chapter' | 'person' | 'place' | 'event'
export type RecordType = Exclude<EntityType, 'chapter'>
export type TimePrecision = 'exact' | 'month' | 'year' | 'approximate' | 'unknown'
export interface CustomField { id: string; label: string; value: string }
export interface EntityRef { type: RecordType; id: string }
export interface TextAnchor { from: number; to: number; excerpt: string }

export interface DocumentVersion {
  id: string
  revision: number
  content: JSONContent
  plainText: string
  wordCount: number
  reason: 'initial' | 'automatic' | 'manual' | 'restore'
  label?: string
  pinned: boolean
  createdAt: string
}

export interface Chapter {
  id: string
  workId: string
  title: string
  content: JSONContent
  plainText: string
  wordCount: number
  revision: number
  status: 'draft' | 'revised' | 'done'
  versions: DocumentVersion[]
  updatedAt: string
  volumeId?: string
  deletedAt?: string
  impressionAssetId?: string
}

export interface Volume {
  id: string
  workId: string
  title: string
  chapterIds: string[]
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface Work {
  id: string
  kind: 'memoir' | 'novel' | 'custom'
  title: string
  description: string
  chapterIds: string[]
  targetWords: number
  createdAt: string
  updatedAt: string
  volumeIds?: string[]
  deletedAt?: string
  encrypted?: boolean
  locked?: boolean
  vaultId?: string
}

export interface Asset {
  id: string
  fileName: string
  mimeType: string
  size: number
  width: number
  height: number
  sha256: string
  createdAt: string
  workId?: string
  chapterIds: string[]
  alt?: string
  caption?: string
  deletedAt?: string
}

export interface AiGeneration {
  id: string
  kind: 'chapter_impression' | 'companion_portrait'
  providerId: string
  sourceId: string
  sourceRevision: number
  stylePreset: string
  status: 'confirmed' | 'failed'
  resultAssetIds: string[]
  createdAt: string
  errorCode?: string
}

export interface Track {
  id: string
  title: string
  artist: string
  fileName: string
  mimeType: 'audio/mpeg' | 'audio/wav' | 'audio/ogg' | 'audio/mp4' | 'audio/flac'
  size: number
  sha256: string
  duration?: number
  createdAt: string
  deletedAt?: string
}

export type PlaybackContextKind = 'global' | 'work' | 'chapter' | 'focus'
export interface MusicContexts {
  global: string[]
  works: Record<string, string[]>
  chapters: Record<string, string[]>
  focus: string[]
}
export interface CompanionPermission {
  workIds: string[]
  chapterIds: string[]
  records: boolean
  musicContext: boolean
}
export interface CompanionMessage { id: string; role: 'user' | 'companion'; content: string; createdAt: string; contextSummary?: string }
export interface CompanionMemory { id: string; content: string; source: 'manual' | 'conversation'; sourceLabel: string; createdAt: string; updatedAt: string; confidence: number; authorized: boolean; sourceWorkId?: string }
export interface CompanionPersonality { warmth: number; curiosity: number; initiative: number }
export interface CompanionGrowthLog { id: string; before: CompanionPersonality; after: CompanionPersonality; reason: string; createdAt: string }
export interface CharacterSlot {
  x: number
  y: number
  width?: number
  height?: number
}
export interface CharacterSpriteAsset {
  assetId: string
  slot?: string
  offset?: { x?: number; y?: number }
}
export type CharacterSpriteReference = string | CharacterSpriteAsset
export interface CompanionCharacterPackage {
  version: 1 | 2
  id: string
  name: string
  canvas: { width: number; height: number }
  renderer?: { type: 'sprite' }
  slots?: Record<string, CharacterSlot>
  baseAssetId: string
  baseSprite?: CharacterSpriteAsset
  eyes: Record<string, Partial<Record<'open' | 'half' | 'closed', CharacterSpriteReference>>>
  brows: Record<string, CharacterSpriteReference>
  mouth: Record<string, CharacterSpriteReference>
  overlays: Record<string, CharacterSpriteReference>
  expressions: Record<string, { eye: string; brow: string; mouth: string; overlay?: string }>
  motions: Record<string, { frameAssetIds: string[]; fps: number; loop: boolean }>
}
export interface CompanionData {
  name: string
  expression: 'calm' | 'warm' | 'thinking'
  appearance: { hair: 'ink' | 'short' | 'long'; outfit: 'linen' | 'night' | 'sage'; portraitAssetId?: string }
  desktop: { visible: boolean; characterPackage?: CompanionCharacterPackage }
  provider: { providerId: 'mock' | 'custom'; endpoint: string; model: string }
  permissions: CompanionPermission
  messages: CompanionMessage[]
  memories: CompanionMemory[]
  personality: CompanionPersonality
  growth: { enabled: boolean; logs: CompanionGrowthLog[] }
}

export interface Person {
  id: string
  name: string
  summary: string
  tags: string[]
  chapterIds: string[]
  aliases: string[]
  importantExperiences: string
  customFields: CustomField[]
  deletedAt?: string
}

export interface Place {
  id: string
  name: string
  region: string
  description: string
  chapterIds: string[]
  aliases: string[]
  address: string
  relatedPeriod: string
  tags: string[]
  customFields: CustomField[]
  deletedAt?: string
}

export interface TimelineEvent {
  id: string
  title: string
  displayTime: string
  precision: TimePrecision
  description: string
  chapterIds: string[]
  startDate?: string
  endDate?: string
  sortTime?: string
  manualOrder: number
  customFields: CustomField[]
  deletedAt?: string
}

export type CourseDay = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type CoursePeriod = 1 | 2 | 3 | 4 | 5 | 6
export interface Course {
  id: string
  title: string
  day: CourseDay
  period: CoursePeriod
  teacher: string
  location: string
  weeks: string
  note: string
}
export interface DiaryEntry { date: string; title: string; content: string; updatedAt: string }
export interface CalendarEvent {
  id: string
  title: string
  date: string
  time?: string
  note?: string
}
export interface TodoItem {
  id: string
  title: string
  note: string
  dueDate?: string
  priority: 'low' | 'medium' | 'high'
  repeat?: 'none' | 'daily' | 'weekly' | 'weekdays'
  repeatDays?: CourseDay[]
  completed: boolean
  completedDates?: string[]
  createdAt: string
}
export interface PlannerData {
  courses: Course[]
  diaryEntries: DiaryEntry[]
  todos: TodoItem[]
  calendarEvents: CalendarEvent[]
  term: { startDate: string; totalWeeks: number }
  courseImportVersion?: number
}

export interface PersonRelation { id: string; fromPersonId: string; toPersonId: string; relationType: string; description: string }
export interface EntityLink { id: string; sourceType: EntityType; sourceId: string; targetType: EntityType; targetId: string; relationType: 'mentions' | 'occurs_at' | 'involves' | 'related'; anchor?: TextAnchor; createdAt: string }

export interface ModuleSetting {
  id: 'writing' | 'music' | 'companion'
  enabled: boolean
  available: boolean
}

export interface LibraryData {
  schemaVersion: 1
  works: Work[]
  chapters: Record<string, Chapter>
  volumes: Volume[]
  people: Person[]
  places: Place[]
  events: TimelineEvent[]
  personRelations: PersonRelation[]
  entityLinks: EntityLink[]
  assets: Asset[]
  aiGenerations: AiGeneration[]
  tracks: Track[]
  musicContexts: MusicContexts
  companion: CompanionData
  planner: PlannerData
  settings: {
    theme: ThemeId
    showRightPanel: boolean
    compactNavigation: boolean
    dailyTarget: number
    modules: ModuleSetting[]
    layoutProfile: 'writing' | 'minimal' | 'custom'
    navigationOrder: ViewId[]
    backgroundImage?: string
    ai: { providerId: 'mock' | 'custom'; endpoint: string; model: string; stylePreset: string }
    backup: { dailyEnabled: boolean; directory: string; retentionCount: number; lastAutomaticDate?: string; lastAutomaticError?: string }
    security: { autoLockMinutes: number }
    music: { volume: number; loop: 'off' | 'all' | 'one'; autoSwitch: boolean; playerVisible: boolean }
  }
  session: {
    activeView: ViewId
    activeWorkId: string
    activeChapterId: string
    openChapterIds: string[]
    focusMode: boolean
    cursorByChapter: Record<string, number>
    scrollByChapter: Record<string, number>
    activeRecord?: EntityRef
    pinnedRecord?: EntityRef
    currentTrackId?: string
    activeDiaryDate?: string
  }
}
