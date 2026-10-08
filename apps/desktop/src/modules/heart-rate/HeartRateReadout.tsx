import { Heart } from 'lucide-react'

/** A decorative heart, not an ECG or a rhythm inferred from the device. */
export function HeartRateReadout({ bpm, compact = false }: { bpm: number | null; compact?: boolean }) {
  return <span className={`heart-readout ${compact ? 'compact' : 'panel'}${bpm ? ' live' : ''}`}>
    {!compact && <svg className="heart-readout-ring" viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="59" /><circle className="heart-ring-dots" cx="66" cy="66" r="52" /><circle className="heart-ring-accent" cx="66" cy="66" r="59" /></svg>}
    <span className="heart-readout-icon" aria-hidden="true"><Heart /></span>
    <span className="heart-readout-value"><strong>{bpm ?? '—'}</strong><small>bpm</small></span>
  </span>
}
