import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import type { CompanionPetSide, CompanionPetStyle } from '../../../domain/models'
import { normalizeCompanionPetSide, normalizeCompanionPetStyle } from '../../../domain/companionPetStyle'
import { useLibraryStore } from '../../../state/useLibraryStore'
import type { PetConversationState } from './conversation'
import { PixelPetRenderer } from './PixelPetRenderer'
import { PET_MODE_REBIND, PET_MODE_STATUS } from './usePetModeShortcut'
import { PET_STYLES } from './art/artProfiles'
import './PixelPetSettings.css'

function StylePicker({ value, onChange }: { value: CompanionPetStyle; onChange: (style: CompanionPetStyle) => void }) {
  return <label className="shortcut-picker"><span>桌宠造型</span>
    <select aria-label="桌宠造型" value={value} onChange={(event) => onChange(normalizeCompanionPetStyle(event.target.value))}>
      {PET_STYLES.map((item) => <option key={item.style} value={item.style}>{item.label}</option>)}
    </select>
  </label>
}
function SidePicker({ value, onChange }: { value: CompanionPetSide; onChange: (side: CompanionPetSide) => void }) {
  return <label className="shortcut-picker"><span>扒边方向</span><select aria-label="扒边方向" value={value} onChange={(event) => onChange(normalizeCompanionPetSide(event.target.value))}>
    <option value="right-edge">右侧</option><option value="left-edge">左侧（镜像）</option><option value="bottom-edge">底部趴边</option>
  </select></label>
}
function ModeShortcutStatus() {
  const [status, setStatus] = useState(() => localStorage.getItem(PET_MODE_STATUS) ?? '')
  useEffect(() => {
    const update = () => setStatus(localStorage.getItem(PET_MODE_STATUS) ?? '')
    window.addEventListener(PET_MODE_STATUS, update)
    return () => window.removeEventListener(PET_MODE_STATUS, update)
  }, [])
  return <div className="setting-row"><div><strong>形象切换快捷键 · Ctrl+Alt+Q</strong><small role="status">{status || 'Ctrl+Alt+Q：切换桌宠与 WebM / 原角色（桌面程序运行时）'}</small></div>
    <button className="ghost-button" disabled={!isTauri() || status === '正在绑定 Ctrl+Alt+Q…'} onClick={() => window.dispatchEvent(new Event(PET_MODE_REBIND))}>重新绑定</button>
  </div>
}
export function PixelPetSettings() {
  const { data, setCompanionPixelPet, setCompanionPetStyle, setCompanionPetSide, setCompanionDesktopMode } = useLibraryStore()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [enlarged, setEnlarged] = useState(false)
  const [freePreview, setFreePreview] = useState(false)
  const enabled = data.companion.desktop.pixelPetEnabled ?? false
  const style = normalizeCompanionPetStyle(data.companion.desktop.pixelPetStyle)
  const side = normalizeCompanionPetSide(data.companion.desktop.pixelPetSide)
  return <div className="pet-settings">
    <div className="setting-row companion-shortcut-row">
      <div><strong>桌宠 · 三种造型预览</strong><span>自然半身、左右扒边或底部趴边，右键可快速切换；WebM 素材保持不变</span></div>
      <label className="shortcut-picker"><span>渲染模式</span><select aria-label="伙伴渲染模式" value={enabled ? 'pixel-pet' : 'webm'} onChange={(event) => setCompanionPixelPet(event.target.value === 'pixel-pet')}>
        <option value="webm">WebM / 原角色</option><option value="pixel-pet">桌宠模式</option>
      </select></label>
    </div>
    <ModeShortcutStatus />
    {enabled && <><div className="setting-row"><div><strong>选择造型</strong><span>共用视线、眨眼与轻待机；闲置约90秒轻闭眼，互动即醒。</span></div><StylePicker value={style} onChange={setCompanionPetStyle} /></div>
      <div className="pet-style-gallery" role="group" aria-label="桌宠造型预选">{PET_STYLES.map(item => <button type="button" key={item.style} aria-label={`选择${item.label}造型`} aria-pressed={style === item.style} onClick={() => setCompanionPetStyle(item.style)}><span className="pet-style-image"><img src={item.src} alt="" loading="lazy" style={{ imageRendering: item.pixelated ? 'pixelated' : 'auto' }} /></span><strong>{item.label}</strong><small>{style === item.style ? '正在使用' : '点击切换'}</small></button>)}</div>
    </>}
    {enabled && <div className="setting-row"><div><strong>扒边方向</strong><span>左侧为镜像，底部使用独立趴边造型；位置按设备保存，桌宠和 WebM 分开记忆。</span></div><SidePicker value={side} onChange={setCompanionPetSide} /></div>}
    {enabled && data.companion.desktop.mode === 'quiet' && <div className="setting-row"><div><strong>当前为安静穿透</strong><span>穿透模式不会接收拖动或点击。</span></div><button className="ghost-button" onClick={() => setCompanionDesktopMode('interactive')}>开启鼠标互动</button></div>}
    {enabled && <details className="pet-settings-preview" open={previewOpen} onToggle={(event) => setPreviewOpen(event.currentTarget.open)}><summary>查看动态造型</summary>
      {previewOpen && <><button className="ghost-button" onClick={() => setEnlarged(!enlarged)}>{enlarged ? '实际大小' : '放大细看'}</button>
        <button className="ghost-button" onClick={() => setFreePreview(!freePreview)}>{freePreview ? '查看扒边' : '查看自然半身'}</button>
        <div className={`pixel-pet-preview pose-${freePreview ? 'float' : side}`}><PixelPetRenderer name={data.companion.name} pose={freePreview ? 'float' : side} style={style} scale={enlarged ? 2 : 1} /></div></>}
      <small>此处追踪页面鼠标，点击预览可眨眼；桌面版追踪屏幕鼠标。停留会安定眼神，离开并静止约六秒后缓慢回正。</small>
    </details>}
  </div>
}
export function PixelPetDebugPage() {
  const [style, setStyle] = useState(() => normalizeCompanionPetStyle(new URLSearchParams(location.search).get('style')))
  const [side, setSide] = useState<CompanionPetSide>(() => normalizeCompanionPetSide(new URLSearchParams(location.search).get('side')))
  const [conversation, setConversation] = useState<PetConversationState>('idle')
  const [compare, setCompare] = useState(false)
  const [freePreview, setFreePreview] = useState(new URLSearchParams(location.search).get('pose') === 'float')
  const [restPreview, setRestPreview] = useState(false)
  const [scale, setScale] = useState(1)
  return <main className="pixel-pet-debug-page">
    <section><h1>伙伴 · 三造型动态预览</h1><p>保留原画，代码实时驱动眼神、眨眼与连续轻待机。移动鼠标观察，点击角色看回应；扒边双手固定；自然半身可自由放置，休息只影响外观。</p>
      <StylePicker value={style} onChange={setStyle} /><SidePicker value={side} onChange={setSide} />
      <label className="shortcut-picker"><span>对话状态</span><select aria-label="预览对话状态" value={conversation} onChange={event => setConversation(event.target.value as PetConversationState)}><option value="idle">待机</option><option value="listening">倾听</option><option value="thinking">思考</option><option value="speaking">回应</option><option value="error">暂未成功</option></select></label>
      <div className="pet-preview-controls">
        <button onClick={() => setFreePreview(!freePreview)}>{freePreview ? '查看扒边' : '查看自然半身'}</button>
        <button onClick={() => setRestPreview(!restPreview)}>{restPreview ? '唤醒预览' : '休息预览'}</button>
        <button onClick={() => setCompare(!compare)}>{compare ? '单独查看' : '三套并排'}</button>
        <button onClick={() => setScale(scale === 1 ? 2 : 1)}>{scale === 1 ? '放大细看' : '实际大小'}</button>
      </div>
      <p>每套显示占位 192 × 240，保持素材原比例。实际桌面仍支持拖动，WebM 不变。</p>
    </section>
    <div className="pet-comparison">{(compare ? PET_STYLES : PET_STYLES.filter((item) => item.style === style)).map((item) =>
      <figure key={item.style}><PixelPetRenderer restPreview={restPreview} conversation={conversation} pose={freePreview ? 'float' : side} style={item.style} scale={scale} /><figcaption>{item.label}</figcaption></figure>)}</div>
  </main>
}
