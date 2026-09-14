import type { CharacterPackage } from '../character/CharacterConfig'
import type { CharacterState } from '../character/CharacterState'

const image = (url: string | undefined, layer: string) => url ? <img className={`character-sprite ${layer}`} src={url} alt="" draggable={false} /> : null

export function CharacterRenderer({ character, state, urls, label }: { character: CharacterPackage; state: CharacterState; urls: Record<string, string>; label: string }) {
  const expression = character.expressions[state.expression] ?? character.expressions.neutral ?? Object.values(character.expressions)[0]
  const eyeSet = character.eyes[expression?.eye] ?? character.eyes.neutral ?? Object.values(character.eyes)[0]
  const eyeId = eyeSet?.[state.eyeState] ?? eyeSet?.open ?? character.eyes.neutral?.open
  const mouthId = state.mode === 'talking' ? character.mouth[state.mouthState] : (expression?.mouth ? character.mouth[expression.mouth] : undefined) ?? character.mouth.closed
  const motion = state.currentMotion ? character.motions[state.currentMotion] : undefined
  const motionId = motion?.frameAssetIds[state.motionFrame]
  return <div className={`character-runtime mode-${state.mode}`} role="img" aria-label={label} style={{ aspectRatio: `${character.canvas.width}/${character.canvas.height}` }}>
    {motionId ? image(urls[motionId], 'motion-layer') : <>
      {image(urls[character.baseAssetId], 'base-layer')}
      {image(eyeId ? urls[eyeId] : undefined, 'eye-layer')}
      {image(expression?.brow ? urls[character.brows[expression.brow]] : undefined, 'brow-layer')}
      {image(mouthId ? urls[mouthId] : undefined, 'mouth-layer')}
      {expression?.overlay ? image(urls[character.overlays[expression.overlay]], 'overlay-layer') : null}
    </>}
  </div>
}
