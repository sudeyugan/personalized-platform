import { describe, expect, it } from 'vitest'
import { createPetPersonality, PET_IDLE_DELAY } from './personality'

const eye = { x: 96, y: 80 }
describe('low-frequency personality', () => {
  it('stays neutral for at least 30 seconds and alternates gaze and tilt separated by quiet time', () => {
    const pet = createPetPersonality(() => 0, eye)
    expect(pet.update(0, false)).toEqual({ tilt: 0, squint: 0, pointer: null })
    expect(pet.update(PET_IDLE_DELAY - 1, false).pointer).toBeNull()
    pet.update(PET_IDLE_DELAY, false)
    expect(pet.update(PET_IDLE_DELAY + 1500, false).pointer).not.toBeNull()
    pet.update(PET_IDLE_DELAY + 3000, false)
    for (let now = 33_100; now < 63_000; now += 100) pet.update(now, false)
    pet.update(63_000, false)
    expect(Math.abs(pet.update(64_500, false).tilt)).toBeGreaterThan(0)
  })
  it('debounces head taps, squints briefly and recovers exactly', () => {
    const pet = createPetPersonality(() => 1, eye)
    pet.update(0, false); expect(pet.pat(100)).toBe(true)
    expect(pet.pat(200)).toBe(false)
    expect(pet.update(650, false).squint).toBeGreaterThan(0)
    for (let now = 750; now < 5000; now += 100) pet.update(now, false)
    expect(pet.update(5000, false)).toEqual({ tilt: 0, squint: 0, pointer: null })
    expect(pet.pat(5100)).toBe(true)
  })
  it('pauses idle gestures during conversation, dragging, rest or pointer attention', () => {
    for (const attentive of [false, true]) {
      const pet = createPetPersonality(() => 0, eye)
      pet.update(0, false)
      pet.update(40_000, !attentive, false, attentive)
      expect(pet.update(60_000, false)).toEqual({ tilt: 0, squint: 0, pointer: null })
    }
  })
  it('allows head-pat squint with pointer attention and reduced motion, without body motion', () => {
    const pet = createPetPersonality(() => 0, eye)
    pet.update(0, false); pet.pat(100)
    const frame = pet.update(650, false, true, true)
    expect(frame.squint).toBeGreaterThan(0)
    expect(frame.tilt).toBe(0); expect(frame.pointer).toBeNull()
  })
})
