import type { CompanionVideoState, CompanionVisual } from '../../domain/models'

export const interactionVideoStates = ['idle', 'listening', 'speaking'] as const satisfies readonly CompanionVideoState[]
export const sceneVideoStates = ['sleepy'] as const satisfies readonly CompanionVideoState[]
export const transientVideoStates = ['celebrating', 'clothes_adjust', 'concerned', 'greeting', 'hair_adjust', 'hands_behind_sway', 'hands_clasped', 'lean_forward', 'looking', 'nodding', 'playful_sway', 'shoulder_relax', 'shy', 'stretching', 'yawning'] as const satisfies readonly CompanionVideoState[]
export const idleInterludeVideoStates = ['clothes_adjust', 'hair_adjust', 'hands_behind_sway', 'hands_clasped', 'lean_forward', 'looking', 'playful_sway', 'shoulder_relax', 'stretching'] as const satisfies readonly CompanionVideoState[]

const idleInterludeWeights: Partial<Record<CompanionVideoState, number>> = {
  clothes_adjust: 4,
  hair_adjust: 3,
  hands_behind_sway: 2,
  hands_clasped: 4,
  lean_forward: 2,
  looking: 3,
  playful_sway: 1,
  shoulder_relax: 3,
  stretching: 2,
}

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
  if (isNight && random() < 0.12) states.push('yawning')
  if (hour < 5 && random() < 0.03) states.push('sleepy')
  return states.filter((state) => configuredClipsForState(visual, state).length > 0)
}


export function configuredIdleInterludes(visual: CompanionVisual) {
  return ([...idleInterludeVideoStates, 'yawning', 'sleepy'] satisfies CompanionVideoState[]).filter((state) => configuredClipsForState(visual, state).length > 0)
}

export function chooseIdleInterlude(items: readonly CompanionVideoState[], previous?: CompanionVideoState, random = Math.random) {
  const alternatives = items.filter((item) => item !== previous)
  const candidates = alternatives.length ? alternatives : [...items]
  const weighted = candidates.flatMap((item) => Array.from({ length: idleInterludeWeights[item] ?? 1 }, () => item))
  if (!weighted.length) return undefined
  const index = Math.min(weighted.length - 1, Math.floor(random() * weighted.length))
  return weighted[index]
}

export function chooseNextIdleClip(visual: CompanionVisual, current?: string, random = Math.random) {
  const clips = configuredClipsForState(visual, 'idle')
  const base = clips[0]
  if (!base) return undefined
  const variants = clips.slice(1)
  if (current !== base || !variants.length || random() < 0.72) return base
  const index = Math.min(variants.length - 1, Math.floor(random() * variants.length))
  return variants[index]
}

export function chooseDifferentItem<T>(items: readonly T[], previous?: T, random = Math.random) {
  if (items.length < 2) return items[0]
  const candidates = items.filter((item) => item !== previous)
  return candidates[Math.floor(random() * candidates.length)]
}

export function nextIdleInterludeDelay(random = Math.random) {
  return Math.min(90_000, 45_000 + Math.floor(random() * 45_001))
}
