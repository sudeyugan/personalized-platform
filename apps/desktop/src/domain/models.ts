import type { JSONContent } from '@tiptap/react'

export type ThemeId = 'warm' | 'light' | 'dark'
export type ViewId = 'home' | 'answerBook' | 'calendar' | 'todos' | 'writing' | 'diary' | 'people' | 'places' | 'timeline' | 'assets' | 'music' | 'help' | 'settings'
export type BackgroundSlot = 'default' | 'daily' | 'creation' | 'immersive' | 'sidebar'
export type SidebarBackgroundMode = 'soft' | 'decoration'

export interface BackgroundSettings {
  images: Partial<Record<BackgroundSlot, string>>
  sidebarMode: SidebarBackgroundMode
}
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
  /** Separates technical companion media from the creative asset library. */
  purpose?: 'creative' | 'companion'
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
  /** @deprecated Kept to migrate libraries saved before granular planner permissions. */
  planner: boolean
  todos: boolean
  calendar: boolean
  courses: boolean
  dailyQuestions: boolean
  diary: boolean
  mood: boolean
  memories: boolean
  answerBook: boolean
  musicContext: boolean
  internet: boolean
  writeActions: boolean
  writePolicy: 'always_ask' | 'balanced'
}
export type ComputerCapability = 'applications' | 'windows' | 'screen_capture' | 'screen_record' | 'input' | 'clipboard_read' | 'clipboard_write' | 'file_read' | 'file_write' | 'file_delete' | 'process_run' | 'process_stop' | 'shell' | 'notifications'
export type ComputerPermissionMode = 'deny' | 'ask' | 'allow'
export interface ComputerGrant {
  id: string
  capability: ComputerCapability
  targetKind: 'global' | 'application' | 'directory' | 'program' | 'display'
  target: string
  mode: ComputerPermissionMode
  createdAt: string
}
export interface CompanionComputerSettings {
  enabled: boolean
  profile: 'standard' | 'trusted_workstation' | 'custom'
  ffmpegPath: string
  recordingDirectory: string
  emergencyShortcut: string
  backgroundReminders: boolean
  reminderLeadMinutes: number
  grants: ComputerGrant[]
}
export interface CompanionMessage { id: string; role: 'user' | 'companion'; content: string; createdAt: string; contextSummary?: string }
export interface CompanionMemory { id: string; content: string; source: 'manual' | 'conversation'; sourceLabel: string; createdAt: string; updatedAt: string; confidence: number; authorized: boolean; sourceWorkId?: string }
export interface CompanionPersonality { warmth: number; curiosity: number; initiative: number }
export interface CompanionGrowthLog { id: string; before: CompanionPersonality; after: CompanionPersonality; reason: string; createdAt: string }
export type CompanionDesktopMode = 'interactive' | 'quiet' | 'normal'
export type CompanionVideoState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy' | 'concerned' | 'surprised' | 'shy' | 'sad' | 'annoyed' | 'greeting' | 'agreeing' | 'celebrating' | 'stretching' | 'sleepy'
export type CompanionVideoLibrary = Partial<Record<CompanionVideoState, string[]>>
export type CompanionVisual =
  | { type: 'portrait'; assetId?: string }
  | { type: 'video'; videos: Partial<Record<CompanionVideoState, string>>; clips?: CompanionVideoLibrary }
  | { type: 'live2d'; modelAssetId?: string }
export interface CompanionAgentAuditEntry {
  id: string
  timestamp: string
  sessionId: string
  toolName: string
  arguments: Record<string, unknown>
  permissionDecision: 'allowed' | 'denied'
  resultStatus: 'success' | 'error'
  durationMs: number
  errorCode?: 'ToolNotFound' | 'InvalidArguments' | 'PermissionDenied' | 'ExecutionFailed' | 'Timeout' | 'AgentStepLimit' | 'AgentCancelled' | 'ModelError'
  errorDetail?: string
  target?: string
  confirmed?: boolean
  permissionReason?: string
}
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
  desktop: { visible: boolean; mode: CompanionDesktopMode; visual: CompanionVisual; videoAssets?: Partial<Record<CompanionVideoState, string>>; videoClips?: CompanionVideoLibrary; toggleShortcut: string; quietShortcut: string; characterPackage?: CompanionCharacterPackage }
  provider: { providerId: 'mock' | 'deepseek' | 'custom'; endpoint: string; model: string }
  voice: {
    stt: { providerId: 'none' | 'elevenlabs' | 'custom'; endpoint: string; model: string }
    tts: { providerId: 'none' | 'elevenlabs' | 'custom'; endpoint: string; model: string; voice: string }
    autoSpeak: boolean
    wakeEnabled: boolean
    wakeWord: string
    wakeSensitivity: 'low' | 'standard' | 'high'
    conversationMode: 'single' | 'short' | 'continuous'
    speakerVerification: boolean
    modelDownloadSource: 'china' | 'auto' | 'global'
    replyLength: 'short' | 'standard'
    longReplySpeech: 'summary' | 'full'
  }
  permissions: CompanionPermission
  computer: CompanionComputerSettings
  messages: CompanionMessage[]
  memories: CompanionMemory[]
  agentAudit: CompanionAgentAuditEntry[]
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
export type MoodKind = 'happy' | 'satisfied' | 'hopeful' | 'relaxed' | 'calm' | 'empty' | 'anxious' | 'irritated' | 'angry' | 'sad' | 'lonely' | 'tired'
export type MoodPeriod = 'morning' | 'afternoon' | 'evening'
export type MoodPoints = Partial<Record<MoodKind, number>>
export interface MoodEntry {
  id: string
  date: string
  period: MoodPeriod
  points: MoodPoints
  note?: string
  createdAt: string
  updatedAt: string
}
export interface CalendarEvent {
  id: string
  title: string
  date: string
  time?: string
  note?: string
}
export interface DailyQuestion {
  id: string
  date: string
  question: string
  background: string
  followUp: string
  topic: string
  tone: 'balanced' | 'sharp'
  createdAt: string
}
export type TodoQuotaPeriod = 'day' | 'week' | 'month'
export interface TodoItem {
  id: string
  title: string
  note: string
  dueDate?: string
  priority: 'low' | 'medium' | 'high'
  repeat?: 'none' | 'daily' | 'weekly' | 'weekdays' | 'quota'
  repeatDays?: CourseDay[]
  quotaPeriod?: TodoQuotaPeriod
  quotaTarget?: number
  quotaCompletions?: { id: string; completedAt: string }[]
  completed: boolean
  completedDates?: string[]
  createdAt: string
}
export interface PlannerData {
  courses: Course[]
  diaryEntries: DiaryEntry[]
  moodEntries: MoodEntry[]
  todos: TodoItem[]
  holidayDates: string[]
  dailyQuestions: DailyQuestion[]
  calendarEvents: CalendarEvent[]
  term: { startDate: string; totalWeeks: number }
  courseImportVersion?: number
}

export interface AnswerBookFavorite {
  id: string
  question: string
  answer: string
  createdAt: string
}

export interface AnswerBookData {
  favorites: AnswerBookFavorite[]
}

export type PrivateDictionaryCategory = 'person' | 'place' | 'organization' | 'project' | 'account' | 'other'
export interface PrivateDictionaryEntry {
  id: string
  value: string
  category: PrivateDictionaryCategory
  enabled: boolean
}
export type OutboundReviewMode = 'balanced' | 'strict'

export interface PersonRelation { id: string; fromPersonId: string; toPersonId: string; relationType: string; description: string }
export interface EntityLink { id: string; sourceType: EntityType; sourceId: string; targetType: EntityType; targetId: string; relationType: 'mentions' | 'occurs_at' | 'involves' | 'related'; anchor?: TextAnchor; createdAt: string }

export interface ModuleSetting {
  id: 'writing' | 'music' | 'companion' | 'answerBook'
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
  answerBook: AnswerBookData
  settings: {
    theme: ThemeId
    showRightPanel: boolean
    compactNavigation: boolean
    dailyTarget: number
    modules: ModuleSetting[]
    layoutProfile: 'writing' | 'minimal' | 'custom'
    navigationOrder: ViewId[]
    backgrounds: BackgroundSettings
    /** Legacy single-background field. Normalization migrates it into backgrounds.default. */
    backgroundImage?: string
    ai: { providerId: 'mock' | 'openrouter' | 'custom'; endpoint: string; model: string; stylePreset: string }
    webSearch: { providerId: 'tencent' | 'bocha' | 'bing'; fallbackToBing: boolean }
    backup: { dailyEnabled: boolean; directory: string; retentionCount: number; lastAutomaticDate?: string; lastAutomaticError?: string }
    security: { autoLockMinutes: number }
    trust: {
      externalAiProcessing: boolean
      shareAuthorizedContext: boolean
      shareRecentConversation: boolean
      retainConversationHistory: boolean
      outboundProtection: boolean
      outboundReviewMode: OutboundReviewMode
      privateDictionary: PrivateDictionaryEntry[]
    }
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
    agentNavigation?: AgentNavigationIntent
  }
}

export interface AgentNavigationIntent {
  id: string
  destination: string
  date?: string
  range?: 'week' | 'month'
  targetId?: string
  filter?: string
  section?: string
}
