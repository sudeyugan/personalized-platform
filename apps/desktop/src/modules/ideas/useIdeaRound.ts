import { useCallback, useEffect, useRef, useState } from 'react'
import type { IdeaMode } from '../../domain/ideas/types'
import { useLibraryStore } from '../../state/useLibraryStore'
import type { PrivacyReviewRequest } from '../privacy'
import { safeError } from '../companion/replies/safety'
import { generateIdeaRound } from './service'

export function useIdeaRound(activeId: string | undefined, generate = generateIdeaRound) {
  const controller = useRef<AbortController | undefined>(undefined)
  const requestId = useRef<string | undefined>(undefined)
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [review, setReview] = useState<{ request: PrivacyReviewRequest; decide(allowed: boolean): void }>()
  const reviewRef = useRef<((allowed: boolean) => void) | undefined>(undefined)
  const mounted = useRef(true)
  const cancel = useCallback(() => { controller.current?.abort(); reviewRef.current?.(false); reviewRef.current = undefined; setReview(undefined) }, [])
  useEffect(() => { setError(''); if (controller.current && requestId.current !== activeId) cancel() }, [activeId, cancel])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); reviewRef.current?.(false) } }, [])
  const run = async (id: string, input: string, mode: IdeaMode = 'explore') => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    const abort = new AbortController(); controller.current = abort; requestId.current = id
    try {
      const revision = useLibraryStore.getState().prepareIdeaRound(id, input, mode)
      const frame = await generate({ id, revision, signal: abort.signal, requestReview: request => new Promise<boolean>(resolve => {
        if (abort.signal.aborted) { resolve(false); return }
        reviewRef.current = resolve
        setReview({ request, decide: allowed => { reviewRef.current = undefined; setReview(undefined); resolve(allowed) } })
      }) })
      if (!abort.signal.aborted && !useLibraryStore.getState().completeIdeaRound(id, revision, frame)) setError('手稿已有变化，本轮整理没有覆盖现有内容。')
    } catch (cause) {
      if (mounted.current && !abort.signal.aborted) setError(safeError(cause instanceof Error ? cause.message : cause))
    } finally {
      if (controller.current === abort) {
        busyRef.current = false; controller.current = undefined
        if (mounted.current) { setBusy(false); reviewRef.current?.(false); reviewRef.current = undefined; setReview(undefined) }
      }
    }
  }
  return { run, busy, error, review, cancel }
}
