import { HeartRateSymbol } from './HeartRateSymbol'

export function WebMHeartRateLabel({ bpm, label, rate }: { bpm: number | null; label: string; rate: number }) {
  return <span className="companion-heart-rate webm-heart-label" data-live={bpm !== null} role="status" aria-label={label}>
    <HeartRateSymbol live={bpm !== null} rate={rate} /><span><strong>{bpm ?? '—'}</strong><small>bpm</small></span>
  </span>
}
