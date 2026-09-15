import { useEffect, useState, type CSSProperties, type ComponentType, type SyntheticEvent } from 'react'
import type { CharacterSpriteReference } from '../../../domain/models'
import { spriteAssetId, type CharacterPackage } from '../character/CharacterConfig'
import type { CharacterState } from '../character/CharacterState'

export interface CharacterRendererProps {
  character: CharacterPackage
  state: CharacterState
  urls: Record<string, string>
  label: string
  debugSlots?: boolean
}

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
  const slot = sprite.slot ? character.slots?.[sprite.slot] : undefined
  return {
    x: slot ? slot.x + (sprite.offset?.x ?? 0) : 0,
    y: slot ? slot.y + (sprite.offset?.y ?? 0) : 0,
    width: slot?.width,
    height: slot?.height,
    positioned: true,
    missingSlot: sprite.slot && !slot ? sprite.slot : undefined,
  }
}

const percent = (value: number, total: number) => `${(value / total) * 100}%`

function CharacterSprite({ character, sprite, urls, layer }: { character: CharacterPackage; sprite?: CharacterSpriteReference; urls: Record<string, string>; layer: string }) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>()
  const placement = sprite ? resolveSpritePlacement(character, sprite) : undefined
  const assetId = sprite ? spriteAssetId(sprite) : undefined
  const url = assetId ? urls[assetId] : undefined

  useEffect(() => {
    setNaturalSize(undefined)
  }, [assetId])

  useEffect(() => {
    if (import.meta.env.DEV && placement?.missingSlot) console.error(`Character sprite references missing slot: ${placement.missingSlot}`)
  }, [placement?.missingSlot])

  if (!url || !placement) return null
  let style: CSSProperties | undefined
  if (placement.positioned) {
    const width = naturalSize?.width
    const height = naturalSize?.height
    style = {
      inset: 'auto',
      left: percent(placement.x, character.canvas.width),
      top: percent(placement.y, character.canvas.height),
      width: width === undefined ? 0 : percent(width, character.canvas.width),
      height: height === undefined ? 0 : percent(height, character.canvas.height),
      visibility: width === undefined || height === undefined ? 'hidden' : undefined,
    }
  }

  const loaded = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget
    if (placement.positioned) setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight })
    if (import.meta.env.DEV && placement.width !== undefined && placement.height !== undefined && (placement.width !== image.naturalWidth || placement.height !== image.naturalHeight)) {
      console.warn(`Character sprite ${assetId} is ${image.naturalWidth} × ${image.naturalHeight}; slot reference is ${placement.width} × ${placement.height}. Rendering at the sprite's original size.`)
    }
  }

  return <img className={`character-sprite ${placement.positioned ? 'character-sprite-local ' : ''}${layer}`} style={style} src={url} alt={''} draggable={false} onLoad={loaded} />
}

function CharacterSlotDebug({ character }: { character: CharacterPackage }) {
  return <div className={'character-slot-debug'} aria-hidden={true}>
    {Object.entries(character.slots ?? {}).map(([name, slot]) => <span key={name} style={{
      left: percent(slot.x, character.canvas.width),
      top: percent(slot.y, character.canvas.height),
      width: percent(slot.width ?? 1, character.canvas.width),
      height: percent(slot.height ?? 1, character.canvas.height),
    }}><b>{name}</b></span>)}
  </div>
}

export function CharacterRenderer({ character, state, urls, label, debugSlots = false }: CharacterRendererProps) {
  const expression = character.expressions[state.expression] ?? character.expressions.neutral ?? Object.values(character.expressions)[0]
  const eyeSet = character.eyes[expression?.eye] ?? character.eyes.neutral ?? Object.values(character.eyes)[0]
  const eye = eyeSet?.[state.eyeState] ?? eyeSet?.open ?? character.eyes.neutral?.open
  const mouth = state.mode === 'talking' ? character.mouth[state.mouthState] : (expression?.mouth ? character.mouth[expression.mouth] : undefined) ?? character.mouth.closed
  const motion = state.currentMotion ? character.motions[state.currentMotion] : undefined
  const motionId = motion?.frameAssetIds[state.motionFrame]
  return <div className={`character-runtime mode-${state.mode}`} role={'img'} aria-label={label} style={{ aspectRatio: `${character.canvas.width}/${character.canvas.height}` }}>
    {motionId ? <CharacterSprite character={character} sprite={motionId} urls={urls} layer={'motion-layer'} /> : <>
      <CharacterSprite character={character} sprite={character.baseSprite ?? character.baseAssetId} urls={urls} layer={'base-layer'} />
      <CharacterSprite character={character} sprite={eye} urls={urls} layer={'eye-layer'} />
      <CharacterSprite character={character} sprite={expression?.brow ? character.brows[expression.brow] : undefined} urls={urls} layer={'brow-layer'} />
      <CharacterSprite character={character} sprite={mouth} urls={urls} layer={'mouth-layer'} />
      <CharacterSprite character={character} sprite={expression?.overlay ? character.overlays[expression.overlay] : undefined} urls={urls} layer={'overlay-layer'} />
    </>}
    {debugSlots && import.meta.env.DEV ? <CharacterSlotDebug character={character} /> : null}
  </div>
}

export const characterRenderers: Record<'sprite', ComponentType<CharacterRendererProps>> = {
  sprite: CharacterRenderer,
}
