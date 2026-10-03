import type { AgentTask, Asset, CompanionData, CompanionDesktopMode, CompanionMessage, CompanionVideoPlacements, CompanionVideoState, CompanionVisual } from '../../domain/models'
import type { AgentRuntimeStatus } from './agent'

export interface CompanionDesktopSnapshot {
  name: string
  expression: CompanionData['expression']
  appearance: CompanionData['appearance']
  action: CompanionVideoState
  actionLabel: string
  pixelPetEnabled: boolean
  desktopVisible: boolean
  desktopMode: CompanionDesktopMode
  visual: CompanionVisual
  videoPlacements: CompanionVideoPlacements
  assetMimeTypes: Record<string, string>
  previewVideoAssetIds: string[]
  messages: CompanionMessage[]
  voice: { sttEnabled: boolean; sttProviderId: CompanionData['voice']['stt']['providerId']; ttsEnabled: boolean; wakeEnabled: boolean; wakeWord: string; wakeSensitivity: CompanionData['voice']['wakeSensitivity']; conversationMode: CompanionData['voice']['conversationMode']; speakerVerification: boolean }
  agentStatus?: AgentRuntimeStatus
  task?: AgentTask
}

export const emptyCompanionDesktopSnapshot: CompanionDesktopSnapshot = {
  name: '小隅',
  expression: 'calm',
  appearance: { hair: 'ink', outfit: 'linen' },
  action: 'idle',
  actionLabel: '在这一隅陪着你',
  pixelPetEnabled: false,
  desktopVisible: false,
  desktopMode: 'interactive',
  visual: { type: 'portrait' },
  videoPlacements: {},
  assetMimeTypes: {},
  previewVideoAssetIds: [],
  messages: [],
  voice: { sttEnabled: false, sttProviderId: 'none', ttsEnabled: false, wakeEnabled: false, wakeWord: '小鱼', wakeSensitivity: 'standard', conversationMode: 'short', speakerVerification: true },
}

export function companionVisualAssetIds(snapshot: CompanionDesktopSnapshot) {
  const activeIds = snapshot.visual.type === 'portrait'
    ? snapshot.visual.assetId ? [snapshot.visual.assetId] : []
    : snapshot.visual.type === 'video' ? [
    ...Object.values(snapshot.visual.videos).filter((id): id is string => Boolean(id)),
    ...Object.values(snapshot.visual.clips ?? {}).flatMap((ids) => ids),
  ] : []
  return [...new Set([...activeIds, ...snapshot.previewVideoAssetIds])]
}

export function companionBlobAssetIds(snapshot: CompanionDesktopSnapshot) {
  return snapshot.visual.type === 'portrait' && snapshot.visual.assetId
    ? [snapshot.visual.assetId]
    : []
}

export function companionDesktopSnapshot(companion: CompanionData, _activeView: string, _playing: boolean, assets: Asset[] = [], overrideAction?: CompanionVideoState, agentStatus?: AgentRuntimeStatus, externalAiAllowed = true, desktopModeOverride?: CompanionDesktopMode): CompanionDesktopSnapshot {
  const interactionAction: CompanionVideoState = agentStatus?.phase === 'responding' ? 'speaking' : 'idle'
  const action: CompanionVideoState = overrideAction === 'listening' || overrideAction === 'speaking'
    ? overrideAction
    : interactionAction !== 'idle'
      ? interactionAction
      : overrideAction ?? 'idle'
  const storedVisual = companion.desktop.visual ?? { type: 'portrait', assetId: companion.appearance.portraitAssetId }
  const visual = storedVisual.type === 'video' ? { ...storedVisual, clips: companion.desktop.videoClips ?? storedVisual.clips } : storedVisual
  const previewVideoAssetIds = [...new Set([
    ...Object.values(companion.desktop.videoAssets ?? {}).filter((id): id is string => Boolean(id)),
    ...Object.values(companion.desktop.videoClips ?? {}).flatMap((ids) => ids),
  ])]
  const ids = new Set(companionVisualAssetIds({ ...emptyCompanionDesktopSnapshot, visual, previewVideoAssetIds }))
  const assetMimeTypes = Object.fromEntries(assets.filter((asset) => !asset.deletedAt && ids.has(asset.id)).map((asset) => [asset.id, asset.mimeType]))
  const labels: Record<CompanionVideoState, string> = { celebrating: '一起庆祝', clothes_adjust: '整理衣服', concerned: '认真关切', greeting: '向你问好', hair_adjust: '整理头发', hands_behind_sway: '双手背后轻轻摇晃', hands_clasped: '调整手部姿态', idle: '在这一隅陪着你', lean_forward: '轻轻探身向前', listening: '正在倾听', looking: '看看周围', nodding: '认真点头', playful_sway: '轻快地左右摇晃', shy: '有一点害羞', sleepy: '有些困倦', speaking: '正在回应', stretching: '舒展一下', yawning: '打个哈欠' }
  const task = [...companion.tasks].reverse().find((item) => item.status !== 'cancelled')
  return { name: companion.name, pixelPetEnabled: companion.desktop.pixelPetEnabled ?? false, desktopVisible: companion.desktop.visible, videoPlacements: companion.desktop.videoPlacements ?? {}, previewVideoAssetIds, desktopMode: desktopModeOverride ?? companion.desktop.mode, expression: companion.expression, appearance: companion.appearance, action, actionLabel: agentStatus?.phase === 'error' ? agentStatus.message : labels[action], visual, assetMimeTypes, messages: companion.messages.slice(-6), voice: { sttEnabled: externalAiAllowed && companion.voice.stt.providerId !== 'none', sttProviderId: companion.voice.stt.providerId, ttsEnabled: externalAiAllowed && companion.voice.tts.providerId !== 'none' && Boolean(companion.voice.tts.voice), wakeEnabled: externalAiAllowed && companion.voice.wakeEnabled, wakeWord: companion.voice.wakeWord, wakeSensitivity: companion.voice.wakeSensitivity, conversationMode: companion.voice.conversationMode, speakerVerification: companion.voice.speakerVerification }, agentStatus, task }
}
