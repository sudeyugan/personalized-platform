import type { Asset, CompanionData, CompanionDesktopMode, CompanionMessage, CompanionVideoState, CompanionVisual } from '../../domain/models'
import type { AgentRuntimeStatus } from './agent'

export interface CompanionDesktopSnapshot {
  name: string
  expression: CompanionData['expression']
  appearance: CompanionData['appearance']
  action: CompanionVideoState
  actionLabel: string
  desktopMode: CompanionDesktopMode
  visual: CompanionVisual
  assetMimeTypes: Record<string, string>
  messages: CompanionMessage[]
  voice: { sttEnabled: boolean; sttProviderId: CompanionData['voice']['stt']['providerId']; ttsEnabled: boolean; wakeEnabled: boolean; wakeWord: string; wakeSensitivity: CompanionData['voice']['wakeSensitivity']; conversationMode: CompanionData['voice']['conversationMode']; speakerVerification: boolean }
  agentStatus?: AgentRuntimeStatus
}

export const emptyCompanionDesktopSnapshot: CompanionDesktopSnapshot = {
  name: '小隅',
  expression: 'calm',
  appearance: { hair: 'ink', outfit: 'linen' },
  action: 'idle',
  actionLabel: '在这一隅陪着你',
  desktopMode: 'interactive',
  visual: { type: 'portrait' },
  assetMimeTypes: {},
  messages: [],
  voice: { sttEnabled: false, sttProviderId: 'none', ttsEnabled: false, wakeEnabled: false, wakeWord: '小鱼', wakeSensitivity: 'standard', conversationMode: 'short', speakerVerification: true },
}

export function companionVisualAssetIds(snapshot: CompanionDesktopSnapshot) {
  if (snapshot.visual.type === 'portrait') return snapshot.visual.assetId ? [snapshot.visual.assetId] : []
  if (snapshot.visual.type === 'video') return [...new Set([
    ...Object.values(snapshot.visual.videos).filter((id): id is string => Boolean(id)),
    ...Object.values(snapshot.visual.clips ?? {}).flatMap((ids) => ids),
  ])]
  return []
}

export function companionDesktopSnapshot(companion: CompanionData, _activeView: string, playing: boolean, assets: Asset[] = [], overrideAction?: CompanionVideoState, agentStatus?: AgentRuntimeStatus, externalAiAllowed = true, desktopModeOverride?: CompanionDesktopMode): CompanionDesktopSnapshot {
  const interactionAction: CompanionVideoState = agentStatus?.phase === 'responding' ? 'speaking' : playing ? 'listening' : 'idle'
  const action: CompanionVideoState = overrideAction === 'listening' || overrideAction === 'speaking'
    ? overrideAction
    : interactionAction !== 'idle'
      ? interactionAction
      : overrideAction ?? 'idle'
  const storedVisual = companion.desktop.visual ?? { type: 'portrait', assetId: companion.appearance.portraitAssetId }
  const visual = storedVisual.type === 'video' ? { ...storedVisual, clips: companion.desktop.videoClips ?? storedVisual.clips } : storedVisual
  const ids = visual.type === 'portrait' && visual.assetId ? new Set([visual.assetId]) : visual.type === 'video' ? new Set(companionVisualAssetIds({ ...emptyCompanionDesktopSnapshot, visual })) : new Set<string>()
  const assetMimeTypes = Object.fromEntries(assets.filter((asset) => !asset.deletedAt && ids.has(asset.id)).map((asset) => [asset.id, asset.mimeType]))
  const labels: Record<CompanionVideoState, string> = { celebrating: '一起庆祝', concerned: '认真关切', greeting: '向你问好', idle: '在这一隅陪着你', listening: '正在倾听', looking: '看看周围', nodding: '认真点头', shy: '有一点害羞', sleepy: '有些困倦', speaking: '正在回应', stretching: '舒展一下', yawning: '打个哈欠' }
  return { name: companion.name, desktopMode: desktopModeOverride ?? companion.desktop.mode, expression: companion.expression, appearance: companion.appearance, action, actionLabel: agentStatus?.phase === 'error' ? agentStatus.message : labels[action], visual, assetMimeTypes, messages: companion.messages.slice(-6), voice: { sttEnabled: externalAiAllowed && companion.voice.stt.providerId !== 'none', sttProviderId: companion.voice.stt.providerId, ttsEnabled: externalAiAllowed && companion.voice.tts.providerId !== 'none' && Boolean(companion.voice.tts.voice), wakeEnabled: externalAiAllowed && companion.voice.wakeEnabled, wakeWord: companion.voice.wakeWord, wakeSensitivity: companion.voice.wakeSensitivity, conversationMode: companion.voice.conversationMode, speakerVerification: companion.voice.speakerVerification }, agentStatus }
}
