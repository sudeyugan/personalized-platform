import { BlinkController } from '../animation/BlinkController'
import { MotionPlayer } from '../animation/MotionPlayer'
import { MouthController, type MouthState } from '../animation/MouthController'
import type { CharacterPackage } from './CharacterConfig'
import { initialCharacterState, type CharacterState } from './CharacterState'

export class CharacterController {
  private state: CharacterState = { ...initialCharacterState }
  private listeners = new Set<(state: CharacterState) => void>()
  private readonly motion = new MotionPlayer()
  private readonly blink = new BlinkController(() => this.state.mode !== 'motion' && this.state.mode !== 'sleeping', (eyeState) => this.patch({ eyeState, blinking: eyeState !== 'open' }))
  private readonly mouth = new MouthController(() => this.state.mode === 'talking', (mouthState) => this.patch({ mouthState }))
  private character: CharacterPackage

  constructor(character: CharacterPackage) { this.character = character; this.state.expression = character.expressions.neutral ? 'neutral' : Object.keys(character.expressions)[0]; this.blink.start() }
  subscribe(listener: (state: CharacterState) => void) { this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener) } }
  snapshot() { return this.state }
  setExpression(expression: string) { if (this.character.expressions[expression]) this.patch({ expression }) }
  async playMotion(name: string) {
    this.mouth.stop()
    this.patch({ mode: 'motion', currentMotion: name, motionFrame: 0, eyeState: 'open' })
    try { await this.motion.play(this.character, name, (motionFrame) => this.patch({ motionFrame })) }
    finally { if (this.state.currentMotion === name) this.patch({ mode: 'idle', currentMotion: undefined, motionFrame: 0 }) }
  }
  stopMotion() { this.motion.stop(); if (this.state.mode === 'motion' || this.state.mode === 'sleeping') this.patch({ mode: 'idle', currentMotion: undefined, motionFrame: 0 }) }
  isPlaying() { return this.motion.isPlaying() }
  startTalking() { if (this.state.mode === 'motion' || this.state.mode === 'sleeping') return; this.patch({ mode: 'talking' }); this.mouth.start() }
  stopTalking() { this.mouth.stop(); if (this.state.mode === 'talking') this.patch({ mode: 'idle' }) }
  setMouthState(mouthState: MouthState) { if (this.state.mode !== 'motion') this.patch({ mouthState }) }
  sleep() { if (this.character.motions.sleep) { this.patch({ mode: 'sleeping', currentMotion: 'sleep', motionFrame: 0 }); void this.motion.play(this.character, 'sleep', (motionFrame) => this.patch({ motionFrame })) } else this.patch({ mode: 'sleeping', eyeState: 'closed' }) }
  wake() { this.stopMotion(); this.patch({ mode: 'idle', eyeState: 'open' }) }
  updateCharacter(character: CharacterPackage) { this.stopMotion(); this.character = character; this.setExpression(character.expressions[this.state.expression] ? this.state.expression : 'neutral') }
  dispose() { this.blink.stop(); this.mouth.stop(); this.motion.stop(); this.listeners.clear() }

  private patch(changes: Partial<CharacterState>) { this.state = { ...this.state, ...changes }; this.listeners.forEach((listener) => listener(this.state)) }
}
