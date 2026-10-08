import { useRef } from 'react'
import { useHeartMarkerPulse } from './useHeartMarkerPulse'

export function HeartRateSymbol({ live, rate, pixel = false }: { live: boolean; rate: number; pixel?: boolean }) {
  const icon = useRef<SVGSVGElement>(null)
  useHeartMarkerPulse(icon, live, rate, pixel)
  return <svg ref={icon} className="companion-heart-symbol" viewBox={pixel ? '0 0 12 11' : '0 0 24 24'} aria-hidden="true">
    {pixel ? <path d="M1 1h4v1h2V1h4v1h1v4h-1v1h-1v1H9v1H8v1H7v1H5v-1H4V9H3V8H2V7H1V6H0V2h1Z" />
      : <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />}
  </svg>
}
