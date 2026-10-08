import { beforeEach, expect, it } from 'vitest'
import { microphoneLevel, readMicrophonePreferences, saveMicrophonePreferences } from './microphonePreferences'
beforeEach(() => localStorage.clear())
it('defaults to the system microphone and bounds local-only gain', () => {
  expect(readMicrophonePreferences()).toEqual({ deviceId: '', gain: 1 })
  saveMicrophonePreferences({ deviceId: 'mic', gain: 200 })
  expect(readMicrophonePreferences()).toEqual({ deviceId: 'mic', gain: 3 })
  localStorage.setItem('yiyu:microphone-preferences', 'broken')
  expect(readMicrophonePreferences()).toEqual({ deviceId: '', gain: 1 })
})
it('computes a clamped local meter without retaining samples', () => {
  expect(microphoneLevel([])).toBe(0)
  expect(microphoneLevel([0.1, -0.1])).toBeCloseTo(0.5)
  expect(microphoneLevel([1])).toBe(1)
})
