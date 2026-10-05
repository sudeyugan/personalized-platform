import { describe, expect, it, vi } from 'vitest'
import { createSeedLibrary, normalizeLibrary } from '../domain/seed'
import { createCompanionSlice } from './companionSlice'
import type { LibraryStore } from './libraryStoreTypes'
vi.mock('./persistence', () => ({
  commitLibraryData: (data: LibraryStore['data'], set: (changes: Partial<LibraryStore>) => void) => set({ data }),
}))
function slice() {
  let state = { data: createSeedLibrary() } as LibraryStore
  const actions = createCompanionSlice(() => state, (changes) => { state = { ...state, ...(typeof changes === 'function' ? changes(state) : changes) } })
  return { actions, get: () => state }
}
describe('identity mutations', () => {
  it('updates wake and profile atomically and preserves voice credentials/settings', () => {
    const { actions, get } = slice()
    actions.setCompanionVoice({ wakeEnabled: true, tts: { voice: 'existing' } })
    actions.setCompanionProfile({ name: ' 阿璃 ' })
    expect(get().data.companion).toMatchObject({ name: '阿璃', voice: { wakeWord: '阿璃', wakeEnabled: true, tts: { voice: 'existing' } } })
    expect(normalizeLibrary(get().data).companion.name).toBe('阿璃')
  })
  it('does not accept independent wake names or enable unsupported names', () => {
    const { actions, get } = slice()
    actions.setCompanionVoice({ wakeEnabled: true, wakeWord: '别的名字' })
    expect(get().data.companion.voice.wakeWord).toBe('小鱼')
    actions.setCompanionProfile({ name: 'Yuki' })
    expect(get().data.companion.voice.wakeEnabled).toBe(false)
    actions.setCompanionVoice({ wakeEnabled: true })
    expect(get().data.companion.voice).toMatchObject({ wakeEnabled: false, wakeWord: 'Yuki' })
    actions.setCompanionProfile({ name: '阿璃' })
    expect(get().data.companion.voice.wakeEnabled).toBe(false)
  })
})
