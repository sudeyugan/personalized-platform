import type { Asset, CompanionCharacterPackage, CompanionData } from '../../domain/models'

export interface CompanionDesktopSnapshot {
  name: string
  expression: CompanionData['expression']
  appearance: CompanionData['appearance']
  action: 'idle' | 'writing' | 'listening' | 'thinking'
  actionLabel: string
  characterPackage?: CompanionCharacterPackage
  assetMimeTypes: Record<string, string>
}

export function companionDesktopSnapshot(companion: CompanionData, activeView: string, playing: boolean, assets: Asset[] = []): CompanionDesktopSnapshot {
  const action = playing ? 'listening' : activeView === 'writing' ? 'writing' : companion.expression === 'thinking' ? 'thinking' : 'idle'
  const characterPackage = companion.desktop.characterPackage
  const assetMimeTypes = characterPackage ? Object.fromEntries(assets.filter((asset) => !asset.deletedAt).map((asset) => [asset.id, asset.mimeType])) : {}
  return { name: companion.name, expression: companion.expression, appearance: companion.appearance, action, actionLabel: action === 'listening' ? '正在听音乐' : action === 'writing' ? '陪你写作' : action === 'thinking' ? '安静思考' : '在这一隅陪着你', characterPackage, assetMimeTypes }
}
