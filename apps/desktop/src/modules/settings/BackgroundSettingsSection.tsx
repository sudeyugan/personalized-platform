import { Copy, ImageUp, PanelsTopLeft, Trash2 } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import type { BackgroundSlot } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'

const backgroundCards: { id: BackgroundSlot; title: string; description: string; ratio: 'wide' | 'portrait' }[] = [
  { id: 'default', title: '通用背景', description: '设置、帮助及其他页面；也是所有场景的回退图', ratio: 'wide' },
  { id: 'daily', title: '日常', description: '首页、日历与待办', ratio: 'wide' },
  { id: 'creation', title: '创作', description: '写作、日记、资料与时间线', ratio: 'wide' },
  { id: 'immersive', title: '沉浸', description: '音乐与答案之书', ratio: 'wide' },
  { id: 'sidebar', title: '侧边栏', description: '推荐竖版、主体位于中下部', ratio: 'portrait' },
]

export function BackgroundSettingsSection() {
  const { data, setBackgroundSettings } = useLibraryStore()
  const settings = data.settings.backgrounds
  const images = settings.images
  const [messages, setMessages] = useState<Partial<Record<BackgroundSlot, string>>>({})

  const chooseImage = (slot: BackgroundSlot) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setMessages((current) => ({ ...current, [slot]: '图片超过 10 MB，请压缩后重试。' }))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => setMessages((current) => ({ ...current, [slot]: '无法读取图片，请换一张重试。' }))
    reader.onload = () => {
      const source = String(reader.result)
      const image = new Image()
      image.onerror = () => setMessages((current) => ({ ...current, [slot]: '无法识别，请使用 JPG、PNG 或 WebP。' }))
      image.onload = () => {
        setBackgroundSettings({ images: { [slot]: source } })
        setMessages((current) => ({ ...current, [slot]: `${image.naturalWidth} × ${image.naturalHeight}` }))
      }
      image.src = source
    }
    reader.readAsDataURL(file)
  }

  const copyDefault = () => {
    if (!images.default) return
    setBackgroundSettings({ images: { daily: images.default, creation: images.default, immersive: images.default } })
  }

  return <section className="settings-section background-library-section">
    <div className="settings-title"><PanelsTopLeft /><div><h2>界面背景</h2><p>不同空间可以使用不同图片；未设置的场景会自动使用通用背景。</p></div></div>
    <div className="background-library-toolbar">
      <span>内容背景推荐 16:9、1920 × 1080 以上；侧边栏推荐 3:8 左右的竖版图。</span>
      <button type="button" disabled={!images.default} onClick={copyDefault}><Copy size={13} />将通用图用于三个场景</button>
    </div>
    <div className="background-library-grid">
      {backgroundCards.map((card) => {
        const source = images[card.id]
        return <article className={`background-slot-card ${card.ratio}`} key={card.id}>
          <div className="background-slot-preview" style={source ? { backgroundImage: `url(${source})` } : undefined}>{!source && <ImageUp size={18} />}</div>
          <div className="background-slot-copy"><strong>{card.title}</strong><small>{card.description}</small>{messages[card.id] && <em>{messages[card.id]}</em>}</div>
          <div className="background-slot-actions">
            <label><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage(card.id)} /><ImageUp size={13} />{source ? '更换' : '选择'}</label>
            {source && <button type="button" title={`清除${card.title}`} onClick={() => setBackgroundSettings({ images: { [card.id]: undefined } })}><Trash2 size={13} /></button>}
          </div>
        </article>
      })}
    </div>
    {images.sidebar && <div className="sidebar-background-mode"><span><strong>侧边栏显示方式</strong><small>“底部装饰”对导航文字干扰更小。</small></span><div>{(['decoration', 'soft'] as const).map((mode) => <button type="button" className={settings.sidebarMode === mode ? 'active' : ''} key={mode} onClick={() => setBackgroundSettings({ sidebarMode: mode })}>{mode === 'decoration' ? '底部装饰' : '柔和铺满'}</button>)}</div></div>}
  </section>
}
