import type { CompanionDesktopSnapshot } from '../companionDesktop'
import type { PetAttention } from './attention'
import type { PixelPoint } from './types'

export type PetConversationState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
export function petConversationState(snapshot: CompanionDesktopSnapshot): PetConversationState {
  if (snapshot.action === 'listening') return 'listening'
  if (snapshot.action === 'speaking' || snapshot.agentStatus?.phase === 'responding') return 'speaking'
  if (snapshot.agentStatus?.phase === 'error') return 'error'
  if (snapshot.agentStatus) return 'thinking'
  return 'idle'
}
export function createPetConversation(eyeCenter: PixelPoint) {
  let previous: PetConversationState = 'idle'
  let listeningTarget: PixelPoint | null = null
  return {
    update(state: PetConversationState, focus: PetAttention) {
      const changed = state !== previous, respond = changed && previous === 'speaking' && state === 'idle'
      if (changed && state === 'listening') listeningTarget = focus.pointer ? { ...focus.pointer } : { ...eyeCenter }
      previous = state
      if (state === 'listening') return { pointer: listeningTarget, settling: true, motion: .35, respond }
      if (state === 'thinking') return { pointer: { x: eyeCenter.x - 12, y: eyeCenter.y + 20 }, settling: true, motion: .6, respond }
      if (state === 'error') return { pointer: null, settling: true, motion: .45, respond }
      return { ...focus, motion: state === 'speaking' ? .7 : 1, respond }
    },
  }
}
