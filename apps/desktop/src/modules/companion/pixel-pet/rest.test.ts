import { describe, expect, it } from 'vitest'
import { createPetRest, PET_REST_DELAY } from './rest'

describe('cosmetic pet rest', () => {
  it('rests after 90 seconds, unrelated outside cursor motion does not wake it', () => {
    const rest = createPetRest()
    rest.update(0, 'idle', null, false)
    let amount = 0
    for (let t = PET_REST_DELAY; t < PET_REST_DELAY + 10000; t += 100) amount = rest.update(t, 'idle', { x: -t, y: 0 }, false)
    expect(amount).toBeGreaterThan(.99)
    rest.wake(PET_REST_DELAY + 10000)
    for (let t = PET_REST_DELAY + 10000; t < PET_REST_DELAY + 12000; t += 100) amount = rest.update(t, 'idle', null, false)
    expect(amount).toBe(0)
  })
  it.each(['listening', 'thinking', 'speaking', 'error'] as const)('never rests during %s', state => {
    const rest = createPetRest()
    rest.update(0, 'idle', null, false)
    expect(rest.update(PET_REST_DELAY + 1, state, null, false)).toBe(0)
  })
  it('hover, dragging and menu engagement reset the visual idle timer', () => {
    const rest = createPetRest()
    rest.update(0, 'idle', null, false)
    rest.update(PET_REST_DELAY - 1, 'idle', { x: 80, y: 100 }, false)
    expect(rest.update(PET_REST_DELAY + 100, 'idle', null, false)).toBe(0)
    rest.update(PET_REST_DELAY * 2, 'idle', null, true)
    expect(rest.update(PET_REST_DELAY * 2 + 100, 'idle', null, false)).toBe(0)
  })
})
