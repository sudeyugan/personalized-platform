import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Figurine } from '../companion/Figurine'
import type { VoicePhase } from '../companion/figurine'
import './pet.css'
interface PetState {
  style: 'mark' | 'figurine' | 'expanded'
  motion: boolean
  resting: boolean
  visible: boolean
  phase: VoicePhase
}
const initial: PetState = {
  style: 'figurine',
  motion: true,
  resting: false,
  visible: true,
  phase: 'idle',
}
declare global {
  interface Window {
    yiyuPetState?: (state: unknown) => void
  }
}
export function PetStage() {
  const [state, setState] = useState(initial)
  useEffect(() => {
    window.yiyuPetState = (value) => {
      if (!value || typeof value !== 'object') return
      const next = value as PetState
      if (
        ['motion', 'resting', 'visible'].some(
          (key) => typeof next[key as keyof PetState] !== 'boolean',
        )
      )
        return
      if (!['idle', 'listening', 'thinking', 'speaking', 'error'].includes(next.phase)) return
      setState({
        ...next,
        style: ['mark', 'figurine', 'expanded'].includes(next.style) ? next.style : 'figurine',
      })
    }
    return () => {
      delete window.yiyuPetState
    }
  }, [])
  if (!state.visible) return null
  return (
    <div
      className={
        'mobile-overlay phase-' + state.phase + (state.resting || !state.motion ? ' still' : '')
      }
    >
      {state.style === 'mark' ? (
        <div className="ink-mark" aria-label={'小鱼 · ' + state.phase}>
          <i />
          <i />
          <i />
        </div>
      ) : (
        <Figurine phase={state.phase} motion={state.motion && !state.resting} />
      )}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<PetStage />)
