import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { characterRenderers } from '../rendering/CharacterRenderer'
import type { CharacterPackage } from './CharacterConfig'
import { CharacterController } from './CharacterController'
import type { CharacterState } from './CharacterState'

export interface CharacterRuntimeHandle {
  setExpression: (name: string) => void
  playMotion: (name: string) => Promise<void>
  startTalking: () => void
  stopTalking: () => void
  sleep: () => void
  wake: () => void
}

export const CharacterRuntime = forwardRef<CharacterRuntimeHandle, { character: CharacterPackage; urls: Record<string, string>; expression?: string; talking?: boolean; label: string; debugSlots?: boolean }>(({ character, urls, expression, talking, label, debugSlots }, ref) => {
  const controller = useMemo(() => new CharacterController(character), [character])
  const [state, setState] = useState<CharacterState>(controller.snapshot())
  useEffect(() => controller.subscribe(setState), [controller])
  useEffect(() => () => controller.dispose(), [controller])
  useEffect(() => { if (expression) controller.setExpression(expression) }, [controller, expression])
  useEffect(() => { if (talking) controller.startTalking(); else controller.stopTalking() }, [controller, talking])
  useImperativeHandle(ref, () => ({ setExpression: (name) => controller.setExpression(name), playMotion: (name) => controller.playMotion(name), startTalking: () => controller.startTalking(), stopTalking: () => controller.stopTalking(), sleep: () => controller.sleep(), wake: () => controller.wake() }), [controller])
  const Renderer = characterRenderers[character.renderer?.type ?? 'sprite']
  return <Renderer character={character} state={state} urls={urls} label={label} debugSlots={debugSlots} />
})

CharacterRuntime.displayName = 'CharacterRuntime'
