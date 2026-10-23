import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Figurine } from '../companion/Figurine'
import type { VoicePhase } from '../companion/figurine'
import type { PetAction } from '../companion/figurineMotion'
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
    yiyuPetAction?: (action: unknown) => void
    yiyuPetContact?: (near: unknown) => void
  }
}
export function PetStage() {
  const [state, setState] = useState(initial)
  const [greeting, setGreeting] = useState(0)
  const [action, setAction] = useState<{ kind: PetAction; key: number }>({ kind: 'idle', key: 0 })
  const [contact, setContact] = useState(false)
  useEffect(() => {
    window.yiyuPetGreeting = () => setGreeting(value => value + 1)
    window.yiyuPetAction = value => {
      if (typeof value === 'string' && ['lift', 'land', 'sit', 'stand', 'edge'].includes(value))
        setAction(previous => ({ kind: value as PetAction, key: previous.key + 1 }))
    }
    window.yiyuPetContact = value => { if (typeof value === 'boolean') setContact(value) }
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
        pose: ['perch', 'left-edge', 'right-edge', 'bottom-edge'].includes(next.pose ?? '') ? next.pose : 'standing',
      })
    }
    return () => {
      delete window.yiyuPetState
      delete window.yiyuPetGreeting
      delete window.yiyuPetAction
      delete window.yiyuPetContact
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
        <Figurine phase={state.phase} motion={state.motion && !state.resting} seated={state.pose === 'perch' || state.pose === 'bottom-edge'} resting={state.resting} greeting={greeting} action={action.kind} actionKey={action.key} edge={state.pose}/>
      )}
      {contact && state.style !== 'mark' && <div className="perch-contact" aria-label="松手坐下" />}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<PetStage />)
