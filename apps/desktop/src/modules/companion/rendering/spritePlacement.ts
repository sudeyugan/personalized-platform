import type { CharacterSpriteReference } from '../../../domain/models'
import type { CharacterPackage } from '../character/CharacterConfig'

export interface SpritePlacement {
  x: number
  y: number
  width?: number
  height?: number
  positioned: boolean
  missingSlot?: string
}

export function resolveSpritePlacement(character: CharacterPackage, sprite: CharacterSpriteReference): SpritePlacement {
  if (typeof sprite === 'string') return { x: 0, y: 0, positioned: false }
  if (!sprite.slot) return { x: 0, y: 0, positioned: false }
  const slot = character.slots?.[sprite.slot]
  return {
    x: slot ? slot.x + (sprite.offset?.x ?? 0) : 0,
    y: slot ? slot.y + (sprite.offset?.y ?? 0) : 0,
    width: slot?.width,
    height: slot?.height,
    positioned: true,
    missingSlot: !slot ? sprite.slot : undefined,
  }
}
