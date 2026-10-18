import { IDEA_LIMITS, type IdeaFrame, type IdeaMode, type IdeaSession } from '../domain/ideas/types'
import { parseIdeaFrame, validateIdeaInput } from '../domain/ideas/validation'
import type { LibraryStore } from './libraryStoreTypes'
import { commitLibraryData, type LibraryStoreSetter } from './persistence'

export interface IdeasActions {
  createIdea(seed: string): string
  selectIdea(id?: string): void
  prepareIdeaRound(id: string, input: string, mode: IdeaMode): number
  completeIdeaRound(id: string, revision: number, frame: IdeaFrame): boolean
  editIdeaDraft(id: string, draft: string): void
  adoptIdeaDraft(id: string, draft: string): void
  forkIdea(id: string, turnIndex: number): string
  trashIdea(id: string, trashed: boolean): void
}
const id = () => `idea-${crypto.randomUUID()}`
const now = () => new Date().toISOString()
export function createIdeasSlice(get: () => LibraryStore, set: LibraryStoreSetter): IdeasActions {
  const commit = (sessions: IdeaSession[], activeId = get().data.ideas?.activeId) => commitLibraryData({ ...get().data, ideas: { sessions, activeId } }, set)
  const find = (key: string) => get().data.ideas?.sessions.find(item => item.id === key && !item.deletedAt)
  const update = (key: string, fn: (item: IdeaSession) => IdeaSession) => commit((get().data.ideas?.sessions ?? []).map(item => item.id === key ? fn(item) : item))
  const make = (seed: string): IdeaSession => ({ id: id(), seed, title: seed.slice(0, 24), createdAt: now(), updatedAt: now(), revision: 0, turns: [], draft: '', draftEdited: false, draftVersions: [], status: 'exploring' })
  return {
    createIdea: seed => { const item = make(validateIdeaInput(seed)); commit([item, ...get().data.ideas?.sessions ?? []], item.id); return item.id },
    selectIdea: key => { if (key && !find(key)) return; commitLibraryData({ ...get().data, ideas: { sessions: get().data.ideas?.sessions ?? [], activeId: key } }, set) },
    prepareIdeaRound: (key, value, mode) => {
      const item = find(key), input = validateIdeaInput(value)
      if (!item) throw new Error('这份手稿已移入收纳袋。')
      if (item.turns.length >= IDEA_LIMITS.turns) throw new Error('这份手稿已经很长了，可将当前整理作为新的念头继续。')
      const revision = item.revision + 1
      update(key, current => ({ ...current, revision, updatedAt: now(), pending: { input, mode } }))
      return revision
    },
    completeIdeaRound: (key, revision, value) => {
      const item = find(key), frame = parseIdeaFrame(value)
      if (!item || item.revision !== revision || !item.pending || !frame) return false
      const pending = item.pending
      update(key, current => ({ ...current, revision: revision + 1, title: frame.title, updatedAt: now(), pending: undefined, status: pending.mode === 'collect' ? 'collected' : 'exploring', draft: current.draftEdited ? current.draft : frame.manuscript,
        turns: [...current.turns, { id: id(), input: pending.input, mode: pending.mode, frame, createdAt: now() }] }))
      return true
    },
    editIdeaDraft: (key, draft) => {
      const item = find(key)
      if (!item || item.draft === draft || draft.length > IDEA_LIMITS.draft) return
      update(key, current => ({ ...current, draft, draftEdited: true, revision: current.revision + 1, updatedAt: now() }))
    },
    adoptIdeaDraft: (key, draft) => {
      const item = find(key)
      if (!item || !draft.trim() || draft.length > IDEA_LIMITS.draft) return
      update(key, current => ({ ...current, draft, draftEdited: true, draftVersions: [...current.draftVersions, current.draft].filter(Boolean).slice(-12), revision: current.revision + 1, updatedAt: now() }))
    },
    forkIdea: (key, index) => {
      const source = find(key)
      if (!source || !Number.isInteger(index) || index < 0 || index >= source.turns.length) throw new Error('找不到这一轮想法。')
      const turns = source.turns.slice(0, index + 1), frame = turns.at(-1)!.frame
      const fork = { ...make(source.seed), title: `${frame.title.slice(0, 30)} · 分支`, forkOf: source.id, turns, draft: frame.manuscript }
      commit([fork, ...get().data.ideas?.sessions ?? []], fork.id)
      return fork.id
    },
    trashIdea: (key, trashed) => {
      const data = get().data.ideas
      const sessions = (data?.sessions ?? []).map(item => item.id === key ? { ...item, deletedAt: trashed ? now() : undefined, revision: item.revision + 1 } : item)
      commitLibraryData({ ...get().data, ideas: { sessions, activeId: trashed && data?.activeId === key ? undefined : data?.activeId } }, set)
    },
  }
}
