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
  voice: { sttEnabled: boolean; sttProviderId: CompanionData['voice']['stt']['providerId']; ttsEnabled: boolean }
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
  voice: { sttEnabled: false, sttProviderId: 'none', ttsEnabled: false },
}

export function companionVisualAssetIds(snapshot: CompanionDesktopSnapshot) {
  if (snapshot.visual.type === 'portrait') return snapshot.visual.assetId ? [snapshot.visual.assetId] : []
  if (snapshot.visual.type === 'video') return [...new Set(Object.values(snapshot.visual.videos).filter((id): id is string => Boolean(id)))]
  return []
}

export function companionDesktopSnapshot(companion: CompanionData, _activeView: string, playing: boolean, assets: Asset[] = [], overrideAction?: CompanionVideoState, agentStatus?: AgentRuntimeStatus): CompanionDesktopSnapshot {
  const action: CompanionVideoState = overrideAction ?? (agentStatus?.phase === 'thinking' || agentStatus?.phase === 'using_tool' ? 'thinking' : agentStatus?.phase === 'responding' ? 'speaking' : playing ? 'listening' : companion.expression === 'thinking' ? 'thinking' : 'idle')
  const visual = companion.desktop.visual ?? { type: 'portrait', assetId: companion.appearance.portraitAssetId }
  const ids = visual.type === 'portrait' && visual.assetId ? new Set([visual.assetId]) : visual.type === 'video' ? new Set(Object.values(visual.videos).filter((id): id is string => Boolean(id))) : new Set<string>()
  const assetMimeTypes = Object.fromEntries(assets.filter((asset) => !asset.deletedAt && ids.has(asset.id)).map((asset) => [asset.id, asset.mimeType]))
  const labels: Record<CompanionVideoState, string> = { idle: '在这一隅陪着你', listening: '正在倾听', thinking: '正在思考', speaking: '正在回应', happy: '心情明亮', concerned: '认真关切', surprised: '稍感意外' }
  return { name: companion.name, expression: companion.expression, appearance: companion.appearance, action, actionLabel: agentStatus?.phase === 'error' ? agentStatus.message : labels[action], visual, assetMimeTypes, messages: companion.messages.slice(-6), voice: { sttEnabled: companion.voice.stt.providerId !== 'none', sttProviderId: companion.voice.stt.providerId, ttsEnabled: companion.voice.tts.providerId !== 'none' && Boolean(companion.voice.tts.voice) }, agentStatus }
}
