import { emitTo, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Eye, GripHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CompanionDesktopSnapshot } from './companionDesktop'
import { characterAssetIds } from './character/CharacterConfig'
import { CharacterRuntime, type CharacterRuntimeHandle } from './character/CharacterRuntime'

const initial: CompanionDesktopSnapshot = { name: '小隅', expression: 'calm', appearance: { hair: 'ink', outfit: 'linen' }, action: 'idle', actionLabel: '在这一隅陪着你', assetMimeTypes: {} }

function useDesktopCharacterUrls(snapshot: CompanionDesktopSnapshot) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let disposed = false
    const created: string[] = []
    if (!snapshot.characterPackage) { setUrls({}); return }
    void Promise.all(characterAssetIds(snapshot.characterPackage).map(async (id) => {
      const mimeType = snapshot.assetMimeTypes[id]
      if (!mimeType) return
      const bytes = await invoke<number[]>('read_companion_image_asset', { id, mimeType })
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeType }))
      created.push(url)
      return [id, url] as const
    })).then((entries) => { if (!disposed) setUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)))) }).catch(() => { if (!disposed) setUrls({}) })
    return () => { disposed = true; created.forEach((url) => URL.revokeObjectURL(url)) }
  }, [snapshot.characterPackage, snapshot.assetMimeTypes])
  return urls
}

export function DesktopCompanionWindow() {
  const [snapshot, setSnapshot] = useState(initial)
  const runtime = useRef<CharacterRuntimeHandle>(null)
  const urls = useDesktopCharacterUrls(snapshot)
  useEffect(() => { let stop: (() => void) | undefined; void listen<CompanionDesktopSnapshot>('companion:snapshot', (event) => setSnapshot(event.payload)).then((value) => { stop = value; void emitTo('main', 'companion:ready') }); return () => stop?.() }, [])
  useEffect(() => { if (snapshot.action === 'writing' && snapshot.characterPackage?.motions.nod) void runtime.current?.playMotion('nod') }, [snapshot.action, snapshot.characterPackage])
  const expression = snapshot.expression === 'warm' ? 'happy' : snapshot.expression === 'thinking' ? 'sad' : 'neutral'
  return <main className={`desktop-companion action-${snapshot.action}`}>
    <div className="desktop-companion-controls" onPointerDown={() => void getCurrentWindow().startDragging()}><GripHorizontal size={15} /><button aria-label="打开一隅主窗口" onClick={() => void emitTo('main', 'companion:open-main')}><Eye size={14} /></button><button aria-label="隐藏桌面伙伴" onClick={() => void emitTo('main', 'companion:hide-request')}><X size={14} /></button></div>
    {snapshot.characterPackage ? <button className="desktop-character-runtime" onClick={() => snapshot.characterPackage?.motions.wave && void runtime.current?.playMotion('wave')} onPointerDown={() => void getCurrentWindow().startDragging()} aria-label={`${snapshot.name}，${snapshot.actionLabel}；点击挥手`}><CharacterRuntime ref={runtime} character={snapshot.characterPackage} urls={urls} expression={expression} talking={snapshot.action === 'listening'} label={`${snapshot.name}角色立绘`} /></button> : <button className={`desktop-character hair-${snapshot.appearance.hair} outfit-${snapshot.appearance.outfit} expression-${snapshot.expression}`} onPointerDown={() => void getCurrentWindow().startDragging()} aria-label={`${snapshot.name}，${snapshot.actionLabel}`}><span className="character-hair" /><span className="character-face">隅</span><span className="character-outfit" /></button>}
    <div className="desktop-companion-caption"><strong>{snapshot.name}</strong><span>{snapshot.actionLabel}</span></div>
  </main>
}
