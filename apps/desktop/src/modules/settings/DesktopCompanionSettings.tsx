import { Cat } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { PixelPetSettings } from '../companion/pixel-pet/PixelPetSettings'
import { CompanionPortraitSection } from './CompanionPortraitSection'
import { CompanionNameSetting } from './CompanionNameSetting'
import { ListeningSettings } from '../music-companion/ListeningSettings'
import { HeartRateSettings } from '../heart-rate/HeartRateSettings'
import { isPetModeShortcut } from '../companion/pixel-pet/usePetModeShortcut'

export function DesktopCompanionSettings() {
  const { data, setCompanionProfile, setCompanionDesktop, setCompanionDesktopMode, setCompanionShortcut, setCompanionQuietShortcut } = useLibraryStore()
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const companion = data.companion
  const [shortcutStatus, setShortcutStatus] = useState(() => window.localStorage.getItem('yiyu:companion-shortcut-status') ?? '快捷键在一隅运行期间全局生效。')
  const [quietShortcutStatus, setQuietShortcutStatus] = useState(() => window.localStorage.getItem('yiyu:companion-quiet-shortcut-status') ?? '按一次进入安静穿透，再按一次恢复。')
  useEffect(() => {
    const updateVisibility = (event: Event) => setShortcutStatus((event as CustomEvent<string>).detail)
    const updateQuiet = (event: Event) => setQuietShortcutStatus((event as CustomEvent<string>).detail)
    window.addEventListener('yiyu:companion-shortcut-status', updateVisibility)
    window.addEventListener('yiyu:companion-quiet-shortcut-status', updateQuiet)
    return () => {
      window.removeEventListener('yiyu:companion-shortcut-status', updateVisibility)
      window.removeEventListener('yiyu:companion-quiet-shortcut-status', updateQuiet)
    }
  }, [])


  return <>
    <section className="settings-section"><div className="settings-title"><Cat /><div><h2>在桌面，留一个陪伴</h2><p>名字也是唤醒名；形象切换不影响聊天和已有素材。</p></div></div>
      <CompanionNameSetting name={companion.name} onChange={name => setCompanionProfile({ name })} />
    <div className="settings-subsection"><div className="settings-subsection-heading"><strong>桌面显示</strong><small>显隐、层级和快捷键，与你的工作方式一致</small></div>
      <div className="setting-row"><div><strong>桌面伙伴</strong><span>透明置顶窗口，可拖动和单独隐藏</span></div><button aria-label="显示桌面伙伴" aria-pressed={companion.desktop.visible} className={companion.desktop.visible ? 'switch on' : 'switch'} onClick={() => setCompanionDesktop(!companion.desktop.visible)}><i /></button></div>
      <div className="setting-row companion-shortcut-row"><div><strong>桌面显示方式</strong><span>{companion.desktop.mode === 'quiet' ? '半透明置顶，不挡住下方点击；可用快捷键或语音恢复互动' : companion.desktop.mode === 'normal' ? '允许其他窗口盖住伙伴，点击和拖动保持可用' : '始终置顶，可直接点击、拖动和打开对话'}</span></div><label className="shortcut-picker companion-mode-picker"><span>模式</span><select aria-label="桌面伙伴显示方式" value={companion.desktop.mode} onChange={(event) => setCompanionDesktopMode(event.target.value as typeof companion.desktop.mode)}><option value="interactive">互动</option><option value="quiet">安静穿透</option><option value="normal">普通窗口</option></select></label></div>
      <div className="setting-row companion-shortcut-row"><div><strong>显示 / 隐藏快捷键</strong><span>{shortcutStatus}</span></div><label className="shortcut-picker"><span>按键组合</span><select aria-label="显示或隐藏伙伴的快捷键" value={companion.desktop.toggleShortcut} onChange={(event) => setCompanionShortcut(event.target.value)}><option value="">关闭快捷键</option><option value="CommandOrControl+Alt+Y">Ctrl + Alt + Y</option><option value="CommandOrControl+Alt+J">Ctrl + Alt + J</option><option value="CommandOrControl+Alt+B">Ctrl + Alt + B</option><option value="CommandOrControl+Shift+Y">Ctrl + Shift + Y</option></select></label></div>
      <div className="setting-row companion-shortcut-row"><div><strong>安静穿透快捷键</strong><span>{quietShortcutStatus}</span></div><label className="shortcut-picker"><span>按键组合</span><select aria-label="切换安静穿透模式的快捷键" value={companion.desktop.quietShortcut} onChange={(event) => setCompanionQuietShortcut(event.target.value)}><option value="">关闭快捷键</option><option value="CommandOrControl+Alt+T">Ctrl + Alt + T</option>{isPetModeShortcut(companion.desktop.quietShortcut) && <option value={companion.desktop.quietShortcut} disabled>Ctrl + Alt + Q（已保留给形象切换）</option>}<option value="CommandOrControl+Alt+P">Ctrl + Alt + P</option><option value="CommandOrControl+Shift+T">Ctrl + Shift + T</option></select></label></div>
    </div>
    </section>
    <section className="settings-section"><div className="settings-title"><Cat /><div><h2>桌宠与造型</h2><p>小一点的陪伴，眼神和动作仍在。</p></div></div><PixelPetSettings /></section>
    <details className="settings-section settings-detail" onToggle={event => setMaterialsOpen(event.currentTarget.open)}><summary><span><strong>WebM 与立绘素材</strong><small>原角色模式、动作库与位置校准</small></span><span className="settings-detail-arrow">＋</span></summary>{materialsOpen && <CompanionPortraitSection />}</details>
    <ListeningSettings />
    <HeartRateSettings />
  </>
}
