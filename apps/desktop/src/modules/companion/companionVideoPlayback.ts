import type { CompanionVideoState, CompanionVisual } from '../../domain/models'

export const interactionVideoStates = ['idle', 'listening', 'speaking'] as const satisfies readonly CompanionVideoState[]
export const sceneVideoStates = ['sleepy'] as const satisfies readonly CompanionVideoState[]
export const transientVideoStates = ['celebrating', 'clothes_adjust', 'concerned', 'greeting', 'hair_adjust', 'hands_behind_sway', 'hands_clasped', 'lean_forward', 'looking', 'nodding', 'playful_sway', 'shy', 'stretching', 'yawning'] as const satisfies readonly CompanionVideoState[]
export const idleInterludeVideoStates = ['clothes_adjust', 'hair_adjust', 'hands_behind_sway', 'hands_clasped', 'lean_forward', 'looking', 'playful_sway', 'stretching'] as const satisfies readonly CompanionVideoState[]

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

export function availableIdleInterludes(visual: CompanionVisual, now = new Date(), random = Math.random) {
  const states: CompanionVideoState[] = [...idleInterludeVideoStates]
  const hour = now.getHours()
  const isNight = hour >= 22 || hour < 6
  if (isNight) states.push('yawning')
  if (hour < 5 && random() < 0.12) states.push('sleepy')
  return states.filter((state) => configuredClipsForState(visual, state).length > 0)
}

export function configuredIdleInterludes(visual: CompanionVisual) {
  return ([...idleInterludeVideoStates, 'yawning', 'sleepy'] satisfies CompanionVideoState[]).filter((state) => configuredClipsForState(visual, state).length > 0)
}

// Session-only shuffle bags: inspect IDs, never preload or persist video bytes.
export function createVideoPlaybackRotation(random = Math.random) {
  const played = new Map<string, Set<string>>()
  const previous = new Map<string, string>()
  return {
    choose<T extends string>(group: string, items: readonly T[]): T | undefined {
      const unique = [...new Set(items)]
      if (!unique.length) return undefined
      const seen = played.get(group) ?? new Set<string>()
      let pool = unique.filter((item) => !seen.has(item))
      if (!pool.length) {
        seen.clear()
        pool = unique
      }
      const alternatives = pool.filter((item) => item !== previous.get(group))
      const candidates = alternatives.length ? alternatives : pool
      const chosen = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]
      seen.add(chosen)
      played.set(group, seen)
      previous.set(group, chosen)
      return chosen
    },
  }
}

export type VideoPlaybackRotation = ReturnType<typeof createVideoPlaybackRotation>

export function chooseNextIdleClip(visual: CompanionVisual, current?: string, random = Math.random, rotation?: VideoPlaybackRotation) {
  const clips = configuredClipsForState(visual, 'idle')
  const base = clips[0]
  if (!base) return undefined
  const variants = clips.slice(1)
  if (current !== base || !variants.length || random() < 0.5) return base
  if (rotation) return rotation.choose('idle-variants', variants)
  const index = Math.min(variants.length - 1, Math.floor(random() * variants.length))
  return variants[index]
}

export function nextIdleInterludeDelay(random = Math.random) {
  return Math.min(55_000, 30_000 + Math.floor(random() * 25_001))
}
