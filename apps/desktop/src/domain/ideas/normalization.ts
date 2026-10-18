import { IDEA_LIMITS, type IdeaData, type IdeaSession, type IdeaTurn } from './types'
import { ideaRecord, parseIdeaFrame } from './validation'

const string = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : ''
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : '2000-01-01T00:00:00.000Z'
export function normalizeIdeas(raw: unknown): IdeaData {
  const data = ideaRecord(raw), seen = new Set<string>()
  const sessions: IdeaSession[] = (Array.isArray(data.sessions) ? data.sessions : []).flatMap(value => {
    const item = ideaRecord(value), id = string(item.id, 100), seed = string(item.seed, IDEA_LIMITS.input)
    if (!id || !seed.trim() || seen.has(id)) return []
    seen.add(id)
    const turnIds = new Set<string>()
    const turns: IdeaTurn[] = (Array.isArray(item.turns) ? item.turns : []).slice(0, IDEA_LIMITS.turns).flatMap(rawTurn => {
      const turn = ideaRecord(rawTurn), frame = parseIdeaFrame(turn.frame), turnId = string(turn.id, 100)
      if (!frame || !turnId || turnIds.has(turnId) || typeof turn.input !== 'string') return []
      turnIds.add(turnId)
      return [{ id: turnId, input: turn.input.slice(0, IDEA_LIMITS.input), mode: turn.mode === 'collect' ? 'collect' as const : 'explore' as const, frame, createdAt: date(turn.createdAt) }]
    })
    const pending = ideaRecord(item.pending)
    return [{ id, seed, title: string(item.title, 40) || seed.slice(0, 24), createdAt: date(item.createdAt), updatedAt: date(item.updatedAt), revision: Number.isSafeInteger(item.revision) && Number(item.revision) >= 0 ? Number(item.revision) : 0,
      turns, draft: string(item.draft, IDEA_LIMITS.draft), draftEdited: item.draftEdited === true, draftVersions: (Array.isArray(item.draftVersions) ? item.draftVersions : []).filter((v): v is string => typeof v === 'string').slice(-12).map(v => v.slice(0, IDEA_LIMITS.draft)), status: item.status === 'collected' ? 'collected' as const : 'exploring' as const,
      ...(typeof pending.input === 'string' && pending.input.trim() ? { pending: { input: pending.input.slice(0, IDEA_LIMITS.input), mode: pending.mode === 'collect' ? 'collect' as const : 'explore' as const } } : {}), ...(typeof item.forkOf === 'string' ? { forkOf: item.forkOf.slice(0, 100) } : {}), ...(typeof item.deletedAt === 'string' ? { deletedAt: date(item.deletedAt) } : {}) }]
  })
  return { sessions, activeId: sessions.some(item => item.id === data.activeId && !item.deletedAt) ? String(data.activeId) : undefined }
}
