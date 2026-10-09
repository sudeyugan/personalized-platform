import { useEffect, useRef, useState } from 'react'
import { chooseFortune, FORTUNE_KEYS, type FortuneDraw, type FortuneKind } from '../../domain/fortune'
import { formatLocalDate } from '../../domain/localDate'
import { useLibraryStore } from '../../state/useLibraryStore'
import { getFortuneSign } from './themes'

type Phase = 'ready' | 'shaking' | 'stick' | 'paper'

export function useFortuneRitual() {
  const fortune = useLibraryStore((store) => store.data.fortune)
  const draw = useLibraryStore((store) => store.drawFortune)
  const navigation = useLibraryStore((store) => store.data.session.agentNavigation)
  const [date, setDate] = useState(formatLocalDate)
  const [kind, setKind] = useState<FortuneKind>()
  const [guest, setGuest] = useState(false)
  const [guestDraw, setGuestDraw] = useState<(FortuneDraw & { kind: FortuneKind })>()
  const [phase, setPhase] = useState<Phase>('ready')
  const timer = useRef<number | undefined>(undefined)
  const locked = useRef(false)
  const generation = useRef(0)
  const dateRef = useRef(date)

  const cancel = () => {
    window.clearTimeout(timer.current)
    generation.current++
    locked.current = false
  }
  const refreshDate = () => {
    const current = formatLocalDate()
    if (current !== dateRef.current) {
      cancel()
      dateRef.current = current
      setDate(current)
      setPhase('ready')
      setGuestDraw(undefined)
    }
    return current
  }
  useEffect(() => {
    const checkDate = () => refreshDate()
    const interval = window.setInterval(checkDate, 30_000)
    window.addEventListener('focus', checkDate)
    return () => { cancel(); window.clearInterval(interval); window.removeEventListener('focus', checkDate) }
    // Date checks use refs, not the phase/selection captured by the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const result = guest ? (guestDraw?.kind === kind ? guestDraw : undefined) : kind ? fortune?.[FORTUNE_KEYS[kind]] : undefined
  const sign = kind && result?.date === date ? getFortuneSign(kind, result.signId) : undefined
  const select = (next: FortuneKind) => {
    if (locked.current) return
    const current = refreshDate()
    const saved = guest ? undefined : useLibraryStore.getState().data.fortune?.[FORTUNE_KEYS[next]]
    setGuestDraw(undefined)
    setKind(next)
    setPhase(saved?.date === current && getFortuneSign(next, saved.signId) ? 'paper' : 'ready')
  }
  useEffect(() => {
    if (navigation?.destination !== 'fortune' || !['daily', 'love', 'future'].includes(navigation.section ?? '')) return
    cancel()
    setGuest(false)
    select(navigation.section as FortuneKind)
    // Only an explicit new navigation request should interrupt the ritual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation?.id])
  const back = () => {
    if (locked.current) return
    cancel(); setKind(undefined); setGuestDraw(undefined); setPhase('ready'); refreshDate()
  }
  const changeRecipient = (next: boolean) => {
    if (locked.current || next === guest) return
    cancel(); setGuest(next); setKind(undefined); setGuestDraw(undefined); setPhase('ready'); refreshDate()
  }
  const nextGuest = () => {
    if (!guest || locked.current) return
    cancel(); setGuestDraw(undefined); setPhase('ready'); refreshDate()
  }
  const begin = () => {
    if (!kind || locked.current) return
    const current = refreshDate()
    locked.current = true
    // Commit exactly once on deliberate draw, not on table selection. Closing mid-animation retains it.
    if (guest) setGuestDraw({ ...chooseFortune(undefined, current, Math.random, kind), kind })
    else draw(kind)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setPhase('paper'); locked.current = false; return
    }
    const token = ++generation.current
    const advance = (next: Phase) => {
      if (generation.current !== token) return false
      if (formatLocalDate() !== current) { refreshDate(); return false }
      setPhase(next)
      return true
    }
    setPhase('shaking')
    timer.current = window.setTimeout(() => {
      if (!advance('stick')) return
      timer.current = window.setTimeout(() => { if (advance('paper')) locked.current = false }, 650)
    }, 1050)
  }
  // Restored/deleted data and a new local day cannot leave an empty paper on screen.
  const visiblePhase = phase === 'paper' && !sign ? 'ready' : phase
  return { date, kind, guest, phase: visiblePhase, sign, fortune: guest ? undefined : fortune, select, back, begin, changeRecipient, nextGuest, busy: phase === 'shaking' || phase === 'stick' }
}
