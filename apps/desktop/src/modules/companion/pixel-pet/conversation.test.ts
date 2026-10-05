import { describe, expect, it } from 'vitest'
import { emptyCompanionDesktopSnapshot } from '../companionDesktop'
import { createPetConversation, petConversationState } from './conversation'

describe('pet dialogue linkage without changing art', () => {
  const center = { x: 100, y: 80 }
  const focus = { pointer: { x: 140, y: 70 }, settling: false }
  it('maps the existing listening/responding/thinking/error status with clear priority', () => {
    expect(petConversationState(emptyCompanionDesktopSnapshot)).toBe('idle')
    const agentStatus = { phase: 'thinking' as const, label: '思考中', toolCalls: 0 }
    expect(petConversationState({ ...emptyCompanionDesktopSnapshot, agentStatus })).toBe('thinking')
    expect(petConversationState({ ...emptyCompanionDesktopSnapshot, agentStatus: { ...agentStatus, phase: 'error', message: '失败' } })).toBe('error')
    expect(petConversationState({ ...emptyCompanionDesktopSnapshot, agentStatus: { ...agentStatus, phase: 'responding' } })).toBe('speaking')
    expect(petConversationState({ ...emptyCompanionDesktopSnapshot, action: 'listening', agentStatus })).toBe('listening')
  })
  it('steadies listening at entry and follows again after the turn', () => {
    const behavior = createPetConversation(center)
    expect(behavior.update('listening', focus)).toMatchObject({ pointer: focus.pointer, settling: true, motion: .35 })
    expect(behavior.update('listening', { pointer: { x: -200, y: 500 }, settling: false }).pointer).toEqual(focus.pointer)
    expect(behavior.update('idle', { pointer: null, settling: true }).pointer).toBeNull()
  })
  it('falls back to face-forward listening and uses a subtle thinking gaze', () => {
    const behavior = createPetConversation(center)
    expect(behavior.update('listening', { pointer: null, settling: true }).pointer).toEqual(center)
    expect(behavior.update('thinking', focus)).toMatchObject({ pointer: { x: 88, y: 100 }, settling: true })
    expect(behavior.update('error', focus).pointer).toBeNull()
  })
  it('requests one blink on response completion, not on every idle frame', () => {
    const behavior = createPetConversation(center)
    expect(behavior.update('speaking', focus).respond).toBe(false)
    expect(behavior.update('idle', focus).respond).toBe(true)
    expect(behavior.update('idle', focus).respond).toBe(false)
    expect(behavior.update('thinking', focus).respond).toBe(false)
  })
})
