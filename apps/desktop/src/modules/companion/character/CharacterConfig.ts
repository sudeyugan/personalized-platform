import type { CompanionCharacterPackage } from '../../../domain/models'

export interface CharacterSourceConfig {
  id: string
  name: string
  canvas: { width: number; height: number }
  base: { body: string }
  eyes: Record<string, Partial<Record<'open' | 'half' | 'closed', string>>>
  brows: Record<string, string>
  mouth: Record<string, string>
  overlays?: Record<string, string>
  expressions: Record<string, { eye: string; brow: string; mouth: string; overlay?: string | null }>
  motions?: Record<string, { directory: string; fps: number; loop: boolean }>
}

export interface CharacterPackagePlan {
  source: CharacterSourceConfig
  filesByPath: Map<string, File>
  motionPaths: Record<string, string[]>
}

export type CharacterPackage = CompanionCharacterPackage

export const requiredExpressions = ['neutral', 'happy', 'angry', 'sad'] as const

export function characterAssetIds(character?: CharacterPackage) {
  if (!character) return []
  const ids = new Set<string>([character.baseAssetId])
  Object.values(character.eyes).forEach((states) => Object.values(states).forEach((id) => id && ids.add(id)))
  Object.values(character.brows).forEach((id) => ids.add(id))
  Object.values(character.mouth).forEach((id) => ids.add(id))
  Object.values(character.overlays).forEach((id) => ids.add(id))
  Object.values(character.motions).forEach((motion) => motion.frameAssetIds.forEach((id) => ids.add(id)))
  return [...ids]
}
