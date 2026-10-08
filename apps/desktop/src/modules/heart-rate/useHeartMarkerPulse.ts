import { useEffect, useRef, type RefObject } from 'react'

/** Preserve animation phase as tempo changes; respect visibility and reduced motion. */
export function useHeartMarkerPulse(element: RefObject<SVGSVGElement | null>, live: boolean, rate: number, pixel: boolean) {
  const animation = useRef<Animation | null>(null)
  const currentRate = useRef(rate)
  currentRate.current = rate
  useEffect(() => {
    const node = element.current
    if (!live || !node?.animate) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const sync = () => {
      if (reduced?.matches) { animation.current?.cancel(); animation.current = null; return }
      animation.current ??= node.animate([{ opacity: .68 }, { opacity: 1 }, { opacity: .68 }],
        { duration: 1000, iterations: Infinity, easing: pixel ? 'steps(2, end)' : 'ease-in-out' })
      animation.current.updatePlaybackRate(currentRate.current)
      if (document.hidden) animation.current.pause(); else animation.current.play()
    }
    sync(); reduced?.addEventListener?.('change', sync); document.addEventListener('visibilitychange', sync)
    return () => { animation.current?.cancel(); animation.current = null; reduced?.removeEventListener?.('change', sync); document.removeEventListener('visibilitychange', sync) }
  }, [element, live, pixel])
  useEffect(() => { animation.current?.updatePlaybackRate(rate) }, [rate])
}
