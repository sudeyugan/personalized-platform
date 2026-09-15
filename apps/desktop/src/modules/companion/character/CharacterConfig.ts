import type { CharacterSlot, CharacterSpriteAsset, CharacterSpriteReference, CompanionCharacterPackage } from '../../../domain/models'

export interface CharacterSpriteSource {
  src: string
  slot?: string
  offset?: { x?: number; y?: number }
}

export type CharacterSpriteSourceReference = string | CharacterSpriteSource

export interface CharacterSourceConfig {
  id: string
  name: string
  canvas: { width: number; height: number }
  renderer?: { type: 'sprite' }
  slots?: Record<string, CharacterSlot>
  base: { body: CharacterSpriteSourceReference }
  eyes: Record<string, Partial<Record<'open' | 'half' | 'closed', CharacterSpriteSourceReference>>>
  brows: Record<string, CharacterSpriteSourceReference>
  mouth: Record<string, CharacterSpriteSourceReference>
  overlays?: Record<string, CharacterSpriteSourceReference>
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

export const spriteSourcePath = (sprite: CharacterSpriteSourceReference) => typeof sprite === 'string' ? sprite : sprite.src
export const spriteAssetId = (sprite: CharacterSpriteReference) => typeof sprite === 'string' ? sprite : sprite.assetId
export function resolveSpriteAsset(sprite: CharacterSpriteSource, assetId: string): CharacterSpriteAsset
export function resolveSpriteAsset(sprite: CharacterSpriteSourceReference, assetId: string): CharacterSpriteReference
export function resolveSpriteAsset(sprite: CharacterSpriteSourceReference, assetId: string): CharacterSpriteReference {
  return typeof sprite === 'string' ? assetId : { assetId, slot: sprite.slot, offset: sprite.offset }
}

export function characterAssetIds(character?: CharacterPackage) {
  if (!character) return []
  const ids = new Set<string>([character.baseAssetId])
  if (character.baseSprite) ids.add(character.baseSprite.assetId)
  Object.values(character.eyes).forEach((states) => Object.values(states).forEach((sprite) => sprite && ids.add(spriteAssetId(sprite))))
  Object.values(character.brows).forEach((sprite) => ids.add(spriteAssetId(sprite)))
  Object.values(character.mouth).forEach((sprite) => ids.add(spriteAssetId(sprite)))
  Object.values(character.overlays).forEach((sprite) => ids.add(spriteAssetId(sprite)))
  Object.values(character.motions).forEach((motion) => motion.frameAssetIds.forEach((id) => ids.add(id)))
  return [...ids]
}
