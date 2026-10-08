import { Database, LockKeyhole, Palette, Puzzle, Sparkles, Cat } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { BackupSettingsSection } from './BackupSettingsSection'
import { TransferSettingsSection } from './TransferSettingsSection'
import { EncryptionSettingsSection } from './EncryptionSettingsSection'
import { IntelligenceSettingsHub } from './IntelligenceSettingsHub'
import { TrustSettingsSection } from './TrustSettingsSection'
import { AppearanceSettings } from './AppearanceSettings'
import { ModuleSettings } from './ModuleSettings'
import { RetainedResources } from './RetainedResources'
import { DesktopCompanionSettings } from './DesktopCompanionSettings'

type SettingsTab = 'appearance' | 'desktop' | 'intelligence' | 'modules' | 'data' | 'privacy'
const settingsTabs: { id: SettingsTab; title: string; description: string; icon: ReactNode }[] = [
  { id: 'appearance', title: '外观与写作', description: '主题、背景与书写习惯', icon: <Palette /> },
  { id: 'desktop', title: '桌面伙伴', description: '桌宠、WebM 与实时心率', icon: <Cat /> },
  { id: 'intelligence', title: 'AI 伙伴', description: '模型、语音、记忆与授权', icon: <Sparkles /> },
  { id: 'modules', title: '功能与导航', description: '模块开关与入口顺序', icon: <Puzzle /> },
  { id: 'data', title: '数据管理', description: '备份、恢复与迁移', icon: <Database /> },
  { id: 'privacy', title: '隐私与安全', description: '外发、加密与边界', icon: <LockKeyhole /> },
]

export function SettingsView() {
  const navigation = useLibraryStore(store => store.data.session.agentNavigation)
  const viewport = useRef<HTMLElement>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    try {
      const stored = localStorage.getItem('yiyu.settings.activeTab')
      return settingsTabs.some((item) => item.id === stored) ? stored as SettingsTab : 'appearance'
    } catch { return 'appearance' }
  })
  const chooseTab = (tab: SettingsTab) => {
    setActiveTab(tab)
    try { localStorage.setItem('yiyu.settings.activeTab', tab) } catch { /* Session UI still works without storage. */ }
    viewport.current?.scrollTo?.({ top: 0 })
  }
  useEffect(() => {
    if (navigation?.destination !== 'settings') return
    const aliases: Record<string, SettingsTab> = { appearance: 'appearance', desktop: 'desktop', pet: 'desktop', modules: 'modules', ai: 'intelligence', intelligence: 'intelligence', data: 'data', privacy: 'privacy', security: 'privacy' }
    const tab = navigation.section && aliases[navigation.section]
    if (tab) chooseTab(tab)
  // chooseTab only updates local UI state and the remembered settings tab.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation?.id])
  const activeMeta = settingsTabs.find((item) => item.id === activeTab)!

  return (
    <main ref={viewport} className="settings-view scroll-view">
      <header className="page-header settings-page-header"><div><p className="eyebrow">偏好设置</p><h1>把一隅，调成你的样子。</h1><p>常用的放在眼前，其他的按需展开。</p></div><span className="settings-local-note"><LockKeyhole size={12} />偏好保存在此电脑</span></header>
      <div className="settings-workspace">
        <nav className="settings-side-nav" aria-label="设置分类">
          <div className="settings-side-intro"><strong>设置分类</strong><small>六个分区，不必一次设置完</small></div>
          {settingsTabs.map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? 'active' : ''} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => chooseTab(tab.id)}><i>{tab.icon}</i><span><strong>{tab.title}</strong><small>{tab.description}</small></span></button>)}
          <p>停用功能不会删除内容。<br />常规偏好自动保存，设备连接仅本次运行。</p>
        </nav>
        <section className="settings-pane" aria-label={activeMeta.title}>
          <header className="settings-pane-header"><span>{activeMeta.icon}</span><div><h2>{activeMeta.title}</h2><p>{activeMeta.description}</p></div></header>
          <div className="settings-pane-content" key={activeTab}>
          {activeTab === 'appearance' && <AppearanceSettings />}
          {activeTab === 'desktop' && <DesktopCompanionSettings />}
          {activeTab === 'modules' && <ModuleSettings />}
      {activeTab === 'intelligence' && <IntelligenceSettingsHub />}
      {activeTab === 'data' && <><RetainedResources /><BackupSettingsSection /><TransferSettingsSection /></>}
      {activeTab === 'privacy' && <><TrustSettingsSection /><EncryptionSettingsSection /><section className="settings-section"><div className="settings-title"><Database /><div><h2>本地数据保护</h2><p>资料库、备份与作品加密继续保持彼此独立的恢复边界。</p></div></div><div className="safety-grid"><div><Database /><strong>SQLite 本地资料库</strong><span>事务写入与修订冲突保护</span></div><div><LockKeyhole /><strong>作品级加密</strong><span>Argon2id + XChaCha20-Poly1305，加密后不保留正文索引</span></div><div><Database /><strong>开放备份</strong><span>完整备份不包含 API Key；加密作品仍保持密文</span></div></div></section></>}
          </div>
        </section>
      </div>
    </main>
  )
}
