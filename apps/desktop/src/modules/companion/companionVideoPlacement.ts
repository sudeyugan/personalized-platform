import type { CSSProperties } from 'react'
import type { CompanionVideoPlacement } from '../../domain/models'

export const defaultCompanionVideoPlacement: CompanionVideoPlacement = { scale: 1, x: 0, y: 0 }

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

export function normalizeCompanionVideoPlacement(value?: Partial<CompanionVideoPlacement>): CompanionVideoPlacement {
  return {
    scale: clamp(Number.isFinite(value?.scale) ? value!.scale! : 1, .6, 1.8),
    x: clamp(Number.isFinite(value?.x) ? value!.x! : 0, -40, 40),
    y: clamp(Number.isFinite(value?.y) ? value!.y! : 0, -40, 40),
  }
}

export function companionVideoPlacementStyle(value?: Partial<CompanionVideoPlacement>): CSSProperties {
  const placement = normalizeCompanionVideoPlacement(value)
  return {
    transform: `translate3d(${placement.x}%, ${placement.y}%, 0) scale(${placement.scale})`,
    transformOrigin: 'center bottom',
  }
}

export function isDefaultCompanionVideoPlacement(value?: Partial<CompanionVideoPlacement>) {
  const placement = normalizeCompanionVideoPlacement(value)
  return placement.scale === 1 && placement.x === 0 && placement.y === 0
}

export function moveCompanionVideoPlacement(
  value: Partial<CompanionVideoPlacement> | undefined,
  deltaX: number,
  deltaY: number,
  stageWidth: number,
  stageHeight: number,
) {
  const placement = normalizeCompanionVideoPlacement(value)
  if (stageWidth <= 0 || stageHeight <= 0) return placement
  return normalizeCompanionVideoPlacement({
    ...placement,
    x: placement.x + deltaX / stageWidth * 100,
    y: placement.y + deltaY / stageHeight * 100,
  })
}
