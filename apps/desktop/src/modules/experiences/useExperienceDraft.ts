import { useEffect, useRef, useState } from 'react'
import type { ExperienceDraft, ExperienceEntry } from '../../domain/experiences'

// One in-memory draft only: navigation is safe without persisting private unsaved text/images.
let sessionDraft: { key: string; draft: ExperienceDraft; file?: File } | undefined
export function useExperienceDraft(entry: ExperienceEntry | undefined, place: boolean) {
  const key = entry?.id ?? (place ? 'new-place' : 'new-work')
  const remembered = sessionDraft?.key === key ? sessionDraft : undefined
  const [draft, setDraft] = useState<ExperienceDraft>(() => remembered?.draft ?? entry ?? { category: place ? 'place' : 'novel', title: '', creator: '', dateText: '', note: '', paperStyle: 'linen' })
  const [file, setFile] = useState<File | undefined>(remembered?.file)
  const [dirty, setDirty] = useState(Boolean(remembered))
  const latest = useRef({ draft, file, dirty }); latest.current = { draft, file, dirty }
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (latest.current.dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', protect)
    return () => {
      window.removeEventListener('beforeunload', protect)
      if (latest.current.dirty) sessionDraft = { key, draft: latest.current.draft, file: latest.current.file }
    }
  }, [key])
  const clearDraft = () => { latest.current.dirty = false; if (sessionDraft?.key === key) sessionDraft = undefined }
  return { draft, setDraft, file, setFile, dirty, setDirty, clearDraft }
}
