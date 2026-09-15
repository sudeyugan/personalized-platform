import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CompanionCharacterPackage } from '../../../domain/models'
import { initialCharacterState } from '../character/CharacterState'
import { CharacterRenderer, resolveSpritePlacement } from './CharacterRenderer'

const legacy: CompanionCharacterPackage = {
  version: 1,
  id: 'legacy',
  name: '旧角色',
  canvas: { width: 1024, height: 1536 },
  baseAssetId: 'body',
  eyes: { neutral: { open: 'eye' } },
  brows: { neutral: 'brow' },
  mouth: { closed: 'mouth' },
  overlays: {},
  expressions: { neutral: { eye: 'neutral', brow: 'neutral', mouth: 'closed' } },
  motions: {},
}

describe('character sprite placement', () => {
  it('keeps legacy string sprites at the full-canvas origin', () => {
    expect(resolveSpritePlacement(legacy, 'eye')).toEqual({ x: 0, y: 0, positioned: false })
  })

  it('combines a configured slot with an optional per-sprite offset', () => {
    const character = { ...legacy, version: 2 as const, slots: { eyes: { x: 365, y: 300, width: 300, height: 130 } } }
    expect(resolveSpritePlacement(character, { assetId: 'eye', slot: 'eyes', offset: { x: 4, y: -2 } })).toEqual({
      x: 369,
      y: 298,
      width: 300,
      height: 130,
      positioned: true,
      missingSlot: undefined,
    })
  })

  it('falls back to the origin for a missing slot and exposes development slot guides', () => {
    const character: CompanionCharacterPackage = {
      ...legacy,
      version: 2,
      slots: { eyes: { x: 365, y: 300, width: 300, height: 130 } },
      eyes: { neutral: { open: { assetId: 'eye', slot: 'missing' } } },
    }
    expect(resolveSpritePlacement(character, character.eyes.neutral.open!)).toMatchObject({ x: 0, y: 0, positioned: true, missingSlot: 'missing' })
    const view = render(<CharacterRenderer character={character} state={{ ...initialCharacterState }} urls={{ body: 'body.png', eye: 'eye.png', brow: 'brow.png', mouth: 'mouth.png' }} label={'test'} debugSlots />)
    expect(view.container.querySelector('.character-slot-debug')).toHaveTextContent('eyes')
  })
})
