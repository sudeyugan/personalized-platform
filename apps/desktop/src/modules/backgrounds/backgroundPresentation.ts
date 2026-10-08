import type { CSSProperties } from 'react'
import type { BackgroundSettings } from '../../domain/models'

const bounded = (value: number | undefined, fallback: number, low: number, high: number) => Number.isFinite(value) ? Math.max(low, Math.min(high, value!)) : fallback
export function backgroundPresentation(settings: BackgroundSettings) {
  return {
    mode: settings.mode === 'illustration' ? 'illustration' as const : 'wallpaper' as const,
    style: {
      '--background-x': bounded(settings.positionX, 80, 0, 100) + '%',
      '--background-y': bounded(settings.positionY, 50, 0, 100) + '%',
      '--background-size': bounded(settings.artSize, 45, 15, 85) + '%',
      '--paper-opacity': bounded(settings.paperOpacity, 94, 80, 100) + '%',
    } as CSSProperties,
  }
}
