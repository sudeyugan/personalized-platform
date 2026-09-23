import { BookMarked, Check, Database, LockKeyhole, Music2, Palette, Puzzle, Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { navigationItems } from '../../app/moduleManifest'
import type { ThemeId } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'
import { BackupSettingsSection } from './BackupSettingsSection'
import { TransferSettingsSection } from './TransferSettingsSection'
import { EncryptionSettingsSection } from './EncryptionSettingsSection'
import { IntelligenceSettingsHub } from './IntelligenceSettingsHub'
import { TrustSettingsSection } from './TrustSettingsSection'
import { BackgroundSettingsSection } from './BackgroundSettingsSection'

const themes: { id: ThemeId; name: string; description: string }[] = [
  { id: 'warm', name: '安静温暖', description: '米白、茶褐与一点暮色' },
  { id: 'light', name: '清透日光', description: '轻盈、明亮、专注正文' },
  { id: 'dark', name: '深夜书房', description: '适合夜晚独自写作' },
]

type SettingsTab = 'appearance' | 'intelligence' | 'data' | 'privacy'
const settingsTabs: { id: SettingsTab; title: string; description: string; icon: ReactNode }[] = [
  { id: 'appearance', title: '外观与写作', description: '主题、布局与模块', icon: <Palette /> },
  { id: 'intelligence', title: 'AI 伙伴', description: '模型、形象与权限', icon: <Sparkles /> },
  { id: 'data', title: '数据管理', description: '备份、恢复与迁移', icon: <Database /> },
  { id: 'privacy', title: '隐私与安全', description: '外发、加密与边界', icon: <LockKeyhole /> },
]

export function SettingsView() {
  const { data, setTheme, toggleRightPanel, setDailyTarget, setLayoutProfile, moveNavigation, toggleModule, setMusicSettings } = useLibraryStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const stored = localStorage.getItem('yiyu.settings.activeTab')
    return settingsTabs.some((item) => item.id === stored) ? stored as SettingsTab : 'appearance'
  })
  const chooseTab = (tab: SettingsTab) => { setActiveTab(tab); localStorage.setItem('yiyu.settings.activeTab', tab) }
  const activeMeta = settingsTabs.find((item) => item.id === activeTab)!

  return (
    <main className="settings-view scroll-view">
      <header className="page-header settings-page-header"><div><p className="eyebrow">偏好设置</p><h1>设置</h1><p>按需要调整；停用功能不会删除已有内容。</p></div></header>
      <div className="settings-workspace">
        <nav className="settings-side-nav" aria-label="设置分类">
          <div className="settings-side-intro"><strong>设置分类</strong><small>一次只处理一组选项</small></div>
          {settingsTabs.map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? 'active' : ''} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => chooseTab(tab.id)}><i>{tab.icon}</i><span><strong>{tab.title}</strong><small>{tab.description}</small></span></button>)}
          <p><ShieldGlyph />所有设置自动保存在本机</p>
        </nav>
        <section className="settings-pane">
          <header className="settings-pane-header"><span>{activeMeta.icon}</span><div><h2>{activeMeta.title}</h2><p>{activeMeta.description}</p></div></header>
          <div className="settings-pane-content">
          {activeTab === 'appearance' && <>
      <section className="settings-section">
        <div className="settings-title"><Palette /><div><h2>外观与主题</h2><p>界面主题与导出文稿样式彼此独立。</p></div></div>
        <div className="theme-grid">{themes.map((theme) => <button className={data.settings.theme === theme.id ? 'theme-choice active' : 'theme-choice'} key={theme.id} onClick={() => setTheme(theme.id)}><span className={`theme-preview ${theme.id}`}><i /><i /><i /></span><strong>{theme.name}</strong><small>{theme.description}</small>{data.settings.theme === theme.id && <b><Check size={13} /></b>}</button>)}</div>
      </section>

      <BackgroundSettingsSection />

      <section className="settings-section">
        <div className="settings-title"><Puzzle /><div><h2>布局与写作</h2><p>保留真正需要的信息。</p></div></div>
        <div className="layout-profile-row">{(['writing', 'minimal', 'custom'] as const).map((profile) => <button className={data.settings.layoutProfile === profile ? 'active' : ''} key={profile} onClick={() => setLayoutProfile(profile)}>{profile === 'writing' ? '写作' : profile === 'minimal' ? '极简' : '自定义'}</button>)}</div>
        <div className="setting-row"><div><strong>显示写作右侧栏</strong><span>字数、版本和章节信息</span></div><button className={data.settings.showRightPanel ? 'switch on' : 'switch'} onClick={toggleRightPanel}><i /></button></div>
        <div className="setting-row"><div><strong>显示音乐播放器</strong><span>隐藏控件不会中断已经允许的播放</span></div><button className={data.settings.music.playerVisible ? 'switch on' : 'switch'} onClick={() => setMusicSettings({ playerVisible: !data.settings.music.playerVisible })}><i /></button></div>
        <label className="setting-row"><div><strong>每日字数目标</strong><span>仅展示进度，不做强提醒</span></div><input type="number" min="0" step="100" value={data.settings.dailyTarget} onChange={(event) => setDailyTarget(Number(event.target.value))} /></label>
        <div className="navigation-order"><strong>导航顺序</strong>{data.settings.navigationOrder.map((view, index) => <div key={view}><span>{navigationItems.find((item) => item.id === view)?.label ?? view}</span><span><button disabled={index === 0} onClick={() => moveNavigation(view, -1)}>↑</button><button disabled={index === data.settings.navigationOrder.length - 1} onClick={() => moveNavigation(view, 1)}>↓</button></span></div>)}</div>
      </section>

      <section className="settings-section"><div className="settings-title"><Sparkles /><div><h2>模块</h2><p>停用模块不会删除已有数据，也不会擅自停止或清空内容。</p></div></div><div className="module-list"><div><span className="module-icon writing"><BookGlyph /></span><p><strong>写作</strong><small>作品、资料与时间线</small></p><button className={data.settings.modules.find((item) => item.id === 'writing')?.enabled ? 'switch on' : 'switch'} onClick={() => toggleModule('writing')}><i /></button></div><div><span className="module-icon answer-book"><BookMarked /></span><p><strong>答案之书</strong><small>本地随机回应与收藏书页</small></p><button className={data.settings.modules.find((item) => item.id === 'answerBook')?.enabled ? 'switch on' : 'switch'} onClick={() => toggleModule('answerBook')}><i /></button></div><div><span className="module-icon"><Music2 /></span><p><strong>音乐</strong><small>本地曲库与四层播放上下文</small></p><button className={data.settings.modules.find((item) => item.id === 'music')?.enabled ? 'switch on' : 'switch'} onClick={() => toggleModule('music')}><i /></button></div><div><span className="module-icon"><Sparkles /></span><p><strong>AI 伙伴</strong><small>对话 Agent、桌面立绘与逐项权限</small></p><button className={data.settings.modules.find((item) => item.id === 'companion')?.enabled ? 'switch on' : 'switch'} onClick={() => toggleModule('companion')}><i /></button></div></div></section>
      </>}
      {activeTab === 'intelligence' && <IntelligenceSettingsHub />}
      {activeTab === 'data' && <><BackupSettingsSection /><TransferSettingsSection /></>}
      {activeTab === 'privacy' && <><TrustSettingsSection /><EncryptionSettingsSection /><section className="settings-section"><div className="settings-title"><Database /><div><h2>本地数据保护</h2><p>资料库、备份与作品加密继续保持彼此独立的恢复边界。</p></div></div><div className="safety-grid"><div><Database /><strong>SQLite 本地资料库</strong><span>事务写入与修订冲突保护</span></div><div><LockKeyhole /><strong>作品级加密</strong><span>Argon2id + XChaCha20-Poly1305，加密后不保留正文索引</span></div><div><Database /><strong>开放备份</strong><span>完整备份不包含 API Key；加密作品仍保持密文</span></div></div></section></>}
          </div>
        </section>
      </div>
    </main>
  )
}

function BookGlyph() { return <span className="book-glyph">文</span> }
function ShieldGlyph() { return <LockKeyhole size={12} /> }
