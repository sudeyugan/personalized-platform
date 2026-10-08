import { Check, Palette, Puzzle } from 'lucide-react'
import type { ThemeId } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'
import { BackgroundSettingsSection } from './BackgroundSettingsSection'

const themes: { id: ThemeId; name: string; description: string }[] = [
  { id: 'warm', name: '安静温暖', description: '米白、茶褐与一点暮色' },
  { id: 'light', name: '清透日光', description: '轻盈、明亮、专注正文' },
  { id: 'dark', name: '深夜书房', description: '适合夜晚独自写作' },
]

export function AppearanceSettings() {
  const { data, setTheme, toggleRightPanel, setDailyTarget, setLayoutProfile, setMusicSettings } = useLibraryStore()
  return <>      <section className="settings-section">
        <div className="settings-title"><Palette /><div><h2>外观与主题</h2><p>界面主题与导出文稿样式彼此独立。</p></div></div>
        <div className="theme-grid">{themes.map((theme) => <button className={data.settings.theme === theme.id ? 'theme-choice active' : 'theme-choice'} key={theme.id} onClick={() => setTheme(theme.id)}><span className={`theme-preview ${theme.id}`}><i /><i /><i /></span><strong>{theme.name}</strong><small>{theme.description}</small>{data.settings.theme === theme.id && <b><Check size={13} /></b>}</button>)}</div>
      </section>

      <BackgroundSettingsSection />

      <section className="settings-section">
        <div className="settings-title"><Puzzle /><div><h2>布局与写作</h2><p>保留真正需要的信息。</p></div></div>
        <div className="layout-profile-row">{(['writing', 'minimal', 'custom'] as const).map((profile) => <button className={data.settings.layoutProfile === profile ? 'active' : ''} key={profile} onClick={() => setLayoutProfile(profile)}>{profile === 'writing' ? '写作' : profile === 'minimal' ? '极简' : '自定义'}</button>)}</div>
        <div className="setting-row"><div><strong>显示写作右侧栏</strong><span>字数、版本和章节信息</span></div><button aria-label="显示写作右侧栏" aria-pressed={data.settings.showRightPanel} className={data.settings.showRightPanel ? 'switch on' : 'switch'} onClick={toggleRightPanel}><i /></button></div>
        <div className="setting-row"><div><strong>显示音乐播放器</strong><span>隐藏控件不会中断已经允许的播放</span></div><button aria-label="显示音乐播放器" aria-pressed={data.settings.music.playerVisible} className={data.settings.music.playerVisible ? 'switch on' : 'switch'} onClick={() => setMusicSettings({ playerVisible: !data.settings.music.playerVisible })}><i /></button></div>
        <label className="setting-row"><div><strong>每日字数目标</strong><span>仅展示进度，不做强提醒</span></div><input type="number" min="0" step="100" value={data.settings.dailyTarget} onChange={(event) => setDailyTarget(Number(event.target.value))} /></label>
      </section>

</>
}
