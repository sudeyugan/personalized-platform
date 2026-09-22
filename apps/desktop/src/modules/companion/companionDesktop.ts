import type { Asset, CompanionData, CompanionMessage, CompanionVideoState, CompanionVisual } from '../../domain/models'
import type { AgentRuntimeStatus } from './agent'

export interface CompanionDesktopSnapshot {
  name: string
  expression: CompanionData['expression']
  appearance: CompanionData['appearance']
  action: CompanionVideoState
  actionLabel: string
  visual: CompanionVisual
  assetMimeTypes: Record<string, string>
  messages: CompanionMessage[]
  voice: { sttEnabled: boolean; sttProviderId: CompanionData['voice']['stt']['providerId']; ttsEnabled: boolean; wakeEnabled: boolean }
  agentStatus?: AgentRuntimeStatus
}

export const emptyCompanionDesktopSnapshot: CompanionDesktopSnapshot = {
  name: '小隅',
  expression: 'calm',
  appearance: { hair: 'ink', outfit: 'linen' },
  action: 'idle',
  actionLabel: '在这一隅陪着你',
  visual: { type: 'portrait' },
  assetMimeTypes: {},
  messages: [],
  voice: { sttEnabled: false, sttProviderId: 'none', ttsEnabled: false, wakeEnabled: false },
}

export function companionVisualAssetIds(snapshot: CompanionDesktopSnapshot) {
  if (snapshot.visual.type === 'portrait') return snapshot.visual.assetId ? [snapshot.visual.assetId] : []
  if (snapshot.visual.type === 'video') return [...new Set([
    ...Object.values(snapshot.visual.videos).filter((id): id is string => Boolean(id)),
    ...Object.values(snapshot.visual.clips ?? {}).flatMap((ids) => ids),
  ])]
  return []
}

export function companionDesktopSnapshot(companion: CompanionData, _activeView: string, playing: boolean, assets: Asset[] = [], overrideAction?: CompanionVideoState, agentStatus?: AgentRuntimeStatus, externalAiAllowed = true): CompanionDesktopSnapshot {
  const action: CompanionVideoState = overrideAction ?? (agentStatus?.phase === 'thinking' || agentStatus?.phase === 'using_tool' ? 'thinking' : agentStatus?.phase === 'responding' ? 'speaking' : playing ? 'listening' : companion.expression === 'thinking' ? 'thinking' : 'idle')
  const storedVisual = companion.desktop.visual ?? { type: 'portrait', assetId: companion.appearance.portraitAssetId }
  const visual = storedVisual.type === 'video' ? { ...storedVisual, clips: companion.desktop.videoClips ?? storedVisual.clips } : storedVisual
  const ids = visual.type === 'portrait' && visual.assetId ? new Set([visual.assetId]) : visual.type === 'video' ? new Set(companionVisualAssetIds({ ...emptyCompanionDesktopSnapshot, visual })) : new Set<string>()
  const assetMimeTypes = Object.fromEntries(assets.filter((asset) => !asset.deletedAt && ids.has(asset.id)).map((asset) => [asset.id, asset.mimeType]))
  const labels: Record<CompanionVideoState, string> = { idle: '在这一隅陪着你', listening: '正在倾听', thinking: '正在思考', speaking: '正在回应', happy: '心情明亮', concerned: '认真关切', surprised: '稍感意外', shy: '有一点害羞', sad: '情绪低落', annoyed: '有些不满', greeting: '向你问好', agreeing: '认真点头', celebrating: '一起庆祝', stretching: '舒展一下', sleepy: '有些困倦' }
  return { name: companion.name, expression: companion.expression, appearance: companion.appearance, action, actionLabel: agentStatus?.phase === 'error' ? agentStatus.message : labels[action], visual, assetMimeTypes, messages: companion.messages.slice(-6), voice: { sttEnabled: externalAiAllowed && companion.voice.stt.providerId !== 'none', sttProviderId: companion.voice.stt.providerId, ttsEnabled: externalAiAllowed && companion.voice.tts.providerId !== 'none' && Boolean(companion.voice.tts.voice), wakeEnabled: externalAiAllowed && companion.voice.wakeEnabled }, agentStatus }
}
