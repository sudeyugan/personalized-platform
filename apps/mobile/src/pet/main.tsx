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
  pose?: string
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
    yiyuPetGreeting?: () => void
  }
}
export function PetStage() {
  const [state, setState] = useState(initial)
  const [greeting, setGreeting] = useState(0)
  useEffect(() => {
    window.yiyuPetGreeting = () => setGreeting(value => value + 1)
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
        pose: next.pose === 'perch' ? 'perch' : 'standing',
      })
    }
    return () => {
      delete window.yiyuPetState
      delete window.yiyuPetGreeting
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
        <Figurine phase={state.phase} motion={state.motion && !state.resting} seated={state.pose === 'perch'} resting={state.resting} greeting={greeting}/>
      )}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<PetStage />)
