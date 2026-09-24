import type { CompanionVideoState, CompanionVisual } from '../../domain/models'

export const interactionVideoStates = ['idle', 'listening', 'thinking', 'speaking'] as const satisfies readonly CompanionVideoState[]
export const sceneVideoStates = ['sleepy'] as const satisfies readonly CompanionVideoState[]
export const transientVideoStates = ['happy', 'concerned', 'surprised', 'shy', 'sad', 'annoyed', 'greeting', 'agreeing', 'celebrating', 'stretching'] as const satisfies readonly CompanionVideoState[]

const transientStateSet = new Set<CompanionVideoState>(transientVideoStates)
const sustainedStateSet = new Set<CompanionVideoState>([...interactionVideoStates, ...sceneVideoStates])

export function isTransientVideoState(state: CompanionVideoState) {
  return transientStateSet.has(state)
}

export function isSustainedVideoState(state: CompanionVideoState) {
  return sustainedStateSet.has(state)
}

export function configuredClipsForState(visual: CompanionVisual, state: CompanionVideoState) {
  if (visual.type !== 'video') return []
  const clips = visual.clips?.[state]?.filter(Boolean) ?? []
  if (clips.length) return clips
  const legacy = visual.videos[state]
  return legacy ? [legacy] : []
}

export function availableIdleInterludes(visual: CompanionVisual) {
  return transientVideoStates.filter((state) => configuredClipsForState(visual, state).length > 0)
}

export function chooseDifferentItem<T>(items: readonly T[], previous?: T, random = Math.random) {
  if (items.length < 2) return items[0]
  const candidates = items.filter((item) => item !== previous)
  return candidates[Math.floor(random() * candidates.length)]
}

export function nextIdleInterludeDelay(random = Math.random) {
  return 25_000 + Math.floor(random() * 30_001)
}
