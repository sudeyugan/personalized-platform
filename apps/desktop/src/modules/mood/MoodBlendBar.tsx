import type { MoodPoints } from '../../domain/models'
import { moodGradientStyle, moodSummary } from './moodUtils'

export function MoodBlendBar({ points, compact = false }: { points: MoodPoints; compact?: boolean }) {
  const label = moodSummary(points)
  return <span className={compact ? 'mood-blend-bar compact' : 'mood-blend-bar'} style={moodGradientStyle(points)} role="img" aria-label={label} title={label} />
}
