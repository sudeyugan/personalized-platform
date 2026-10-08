import { ImageUp, PanelsTopLeft } from 'lucide-react'
import { useEffect, useState, type ChangeEvent } from 'react'
import type { BackgroundSlot } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'
import { BackgroundArt } from '../backgrounds/BackgroundArt'
import { backgroundPresentation } from '../backgrounds/backgroundPresentation'
import { migrateBackgrounds } from '../backgrounds/migrateBackgrounds'

export function BackgroundSettingsSection() {
  const { data, setBackgroundSettings, importAsset } = useLibraryStore()
  const settings = data.settings.backgrounds
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewSlot, setPreviewSlot] = useState<BackgroundSlot>('default')
  useEffect(() => { void migrateBackgrounds().catch(() => setMessage('旧背景迁移暂未完成，原图仍保留；下次打开可重试。')) }, [])
  const upload = (slot: BackgroundSlot) => async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file || busy) return
    setBusy(true); setMessage('')
    try {
      const asset = await importAsset(file, { purpose: 'background' })
      setBackgroundSettings({ images: { [slot]: 'asset:' + asset.id } })
      setPreviewSlot(slot)
      setMessage('已保存 · ' + asset.width + ' × ' + asset.height)
    } catch (error) { setMessage(error instanceof Error ? error.message : '图片未能保存，原图不变。') }
    finally { setBusy(false) }
  }
  const source = settings.images[previewSlot] ?? settings.images.default
  const presentation = backgroundPresentation(settings)
  const imageControls = (slot: BackgroundSlot) => <>
    <label className="background-upload"><ImageUp size={14} />{settings.images[slot] ? '更换图片' : '选择图片'}<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void upload(slot)(event) }} /></label>
    {settings.images[slot] && <button type="button" onClick={() => setBackgroundSettings({ images: { [slot]: undefined } })}>{slot === 'default' ? '移除背景' : '恢复通用图'}</button>}
  </>
  return <section className="settings-section">
    <div className="settings-title"><PanelsTopLeft /><div><h2>让一张图，安放在合适的位置</h2><p>壁纸铺满整个空间，插画保留完整比例；纸张负责让文字清楚。</p></div></div>
    <div className="background-mode-picker">{(['wallpaper', 'illustration'] as const).map(mode => <button type="button" className={presentation.mode === mode ? 'active' : ''} onClick={() => setBackgroundSettings({ mode })} key={mode}>{mode === 'wallpaper' ? '壁纸 · 连续铺满' : '插画 · 完整摆放'}</button>)}{imageControls('default')}</div>
    <div className="background-editor">
      <div className="background-layout-preview" style={presentation.style}><BackgroundArt source={source} settings={settings} /><div className="background-preview-layout"><aside>一隅<br />日常<br />创作空间<br />设置</aside><article><small>写作纸张</small><h3>故事的一角</h3>图画留在身后，文字安静地留在纸上。<br />侧栏和正文共用同一幅背景。</article></div></div>
      <div className="background-controls">
        <label>水平位置 · {settings.positionX ?? 80}%<input aria-label="背景水平位置" type="range" min="0" max="100" value={settings.positionX ?? 80} onChange={event => setBackgroundSettings({ positionX: Number(event.target.value) })} /></label>
        <label>垂直位置 · {settings.positionY ?? 50}%<input aria-label="背景垂直位置" type="range" min="0" max="100" value={settings.positionY ?? 50} onChange={event => setBackgroundSettings({ positionY: Number(event.target.value) })} /></label>
        {presentation.mode === 'illustration' && <label>插画大小 · {settings.artSize ?? 45}%<input aria-label="插画大小" type="range" min="15" max="85" value={settings.artSize ?? 45} onChange={event => setBackgroundSettings({ artSize: Number(event.target.value) })} /></label>}
        <label>纸张保护 · {settings.paperOpacity ?? 94}%<input aria-label="纸张保护" type="range" min="80" max="100" value={settings.paperOpacity ?? 94} onChange={event => setBackgroundSettings({ paperOpacity: Number(event.target.value) })} /></label>
      </div>
    </div>
    {message && <p role="status" className="settings-local-note">{message}</p>}
    <details className="background-advanced"><summary>高级：场景覆盖与旧侧栏图</summary><p>通常一张通用图就够了。覆盖图仍使用同一套壁纸／插画布局；只存图片引用，不复制图片。</p>
      {(['daily', 'creation', 'immersive', 'sidebar'] as const).map(slot => <div className="background-scene-row" key={slot}><span>{slot === 'daily' ? '日常' : slot === 'creation' ? '创作' : slot === 'immersive' ? '沉浸' : '旧侧栏装饰'}</span>{slot !== 'sidebar' && <button type="button" onClick={() => setPreviewSlot(slot)}>预览</button>}{imageControls(slot)}</div>)}
      <button type="button" onClick={() => setPreviewSlot('default')}>预览通用背景</button>
    </details>
  </section>
}
