import { emptyExperiences, normalizeExperiences, rankExperience, tierIds, type ExperienceDraft } from '../domain/experiences'
import type { LibraryStore } from './libraryStoreTypes'
import { commitLibraryData, type LibraryStoreSetter } from './persistence'

export interface ExperiencesActions {
  saveExperience: (draft: ExperienceDraft, id?: string) => string
  trashExperience: (id: string) => void
  restoreExperience: (id: string) => void
  permanentlyDeleteExperience: (id: string) => void
  rankExperience: (id: string, tier: ExperienceDraft['tier'], beforeId?: string) => void
  setExperienceTierLabel: (tier: NonNullable<ExperienceDraft['tier']>, label: string) => void
}
export function createExperiencesSlice(get: () => LibraryStore, set: LibraryStoreSetter): ExperiencesActions {
  const commit = (experiences: ReturnType<typeof emptyExperiences>) => commitLibraryData({ ...get().data, experiences }, set)
  return {
    saveExperience: (draft, id) => {
      if (!draft.title.trim()) throw new Error('请先写下名称')
      const experiences = get().data.experiences ?? emptyExperiences()
      const previous = experiences.entries.find(entry => entry.id === id)
      const now = new Date().toISOString()
      const savedId = previous?.id ?? 'experience-' + crypto.randomUUID()
      const entry = { ...draft, id: savedId, order: previous?.order ?? experiences.entries.length, createdAt: previous?.createdAt ?? now, updatedAt: now }
      const normalized = normalizeExperiences({ ...experiences, entries: previous ? experiences.entries.map(item => item.id === savedId ? entry : item) : [...experiences.entries, entry] })
      commit(normalized)
      return savedId
    },
    trashExperience: id => {
      const experiences = get().data.experiences ?? emptyExperiences()
      commit({ ...experiences, entries: experiences.entries.map(entry => entry.id === id ? { ...entry, deletedAt: new Date().toISOString() } : entry) })
    },
    restoreExperience: id => {
      const experiences = get().data.experiences ?? emptyExperiences()
      commit({ ...experiences, entries: experiences.entries.map(entry => entry.id === id ? { ...entry, deletedAt: undefined } : entry) })
    },
    permanentlyDeleteExperience: id => {
      const experiences = get().data.experiences ?? emptyExperiences()
      // Only previously deleted entries can be purged; shared images stay in the asset library.
      if (!experiences.entries.some(entry => entry.id === id && entry.deletedAt)) return
      commit({ ...experiences, entries: experiences.entries.filter(entry => entry.id !== id) })
    },
    rankExperience: (id, tier, beforeId) => {
      const experiences = get().data.experiences ?? emptyExperiences()
      commit({ ...experiences, entries: rankExperience(experiences.entries, id, tier, beforeId) })
    },
    setExperienceTierLabel: (tier, label) => {
      if (!tierIds.includes(tier) || !label.trim()) return
      const experiences = get().data.experiences ?? emptyExperiences()
      commit({ ...experiences, tierLabels: { ...experiences.tierLabels, [tier]: label.trim().slice(0, 12) } })
    },
  }
}
