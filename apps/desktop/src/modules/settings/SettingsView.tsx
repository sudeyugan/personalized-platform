import { Check, Cloud, Database, ImageUp, LockKeyhole, Music2, Palette, Puzzle, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import { navigationItems } from '../../app/moduleManifest'
import type { ThemeId } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'
import { BackupSettingsSection } from './BackupSettingsSection'
import { TransferSettingsSection } from './TransferSettingsSection'
import { EncryptionSettingsSection } from './EncryptionSettingsSection'
import { SettingsCategory } from './SettingsCategory'
import { IntelligenceSettingsHub } from './IntelligenceSettingsHub'

const themes: { id: ThemeId; name: string; description: string }[] = [
  { id: 'warm', name: '安静温暖', description: '米白、茶褐与一点暮色' },
  { id: 'light', name: '清透日光', description: '轻盈、明亮、专注正文' },
  { id: 'dark', name: '深夜书房', description: '适合夜晚独自写作' },
]

export function SettingsView() {
  const { data, setTheme, toggleRightPanel, setDailyTarget, setLayoutProfile, setBackgroundImage, moveNavigation, toggleModule, setMusicSettings } = useLibraryStore()
  const [backgroundMessage, setBackgroundMessage] = useState('推荐 1920 × 1080 或更高的 16:9 图片，JPG / PNG / WebP，建议不超过 10 MB。')

  const chooseBackground = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setBackgroundMessage('图片超过 10 MB，请压缩后再选择。')
      return
    }
    const reader = new FileReader()
    reader.onerror = () => setBackgroundMessage('无法读取这张图片，请换一张重试。')
    reader.onload = () => {
      const source = String(reader.result)
      const image = new Image()
      image.onerror = () => setBackgroundMessage('图片格式无法识别，请使用 JPG、PNG 或 WebP。')
      image.onload = () => {
        setBackgroundImage(source)
        setBackgroundMessage(`${image.naturalWidth} × ${image.naturalHeight} · ${image.naturalWidth < 1600 || image.naturalHeight < 900 ? '尺寸偏小，放大窗口时可能模糊。' : '尺寸合适。'}`)
      }
      image.src = source
    }
    reader.readAsDataURL(file)
  }

  return (
    <main className="settings-view scroll-view">
      <header className="page-header"><div><p className="eyebrow">偏好设置</p><h1>把一隅变成你的样子</h1><p>所有改变只影响呈现，不会删除内容。</p></div></header>

      <SettingsCategory id="appearance" title="外观与写作" description="主题、背景、编辑布局、导航和模块" icon={<Palette />} defaultOpen>
      <section className="settings-section">
        <div className="settings-title"><Palette /><div><h2>外观与主题</h2><p>界面主题与导出文稿样式彼此独立。</p></div></div>
        <div className="theme-grid">{themes.map((theme) => <button className={data.settings.theme === theme.id ? 'theme-choice active' : 'theme-choice'} key={theme.id} onClick={() => setTheme(theme.id)}><span className={`theme-preview ${theme.id}`}><i /><i /><i /></span><strong>{theme.name}</strong><small>{theme.description}</small>{data.settings.theme === theme.id && <b><Check size={13} /></b>}</button>)}</div>
        <div className="background-setting">
          <div className="background-copy"><strong>空间背景图</strong><span>{backgroundMessage}</span></div>
          <div className="background-actions">
            <label className="background-upload"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseBackground} /><ImageUp size={16} /><span>{data.settings.backgroundImage ? '更换图片' : '选择图片'}</span></label>
            {data.settings.backgroundImage && <button className="background-remove" onClick={() => { setBackgroundImage(undefined); setBackgroundMessage('背景已清除。推荐 1920 × 1080 或更高的 16:9 图片。') }}><Trash2 size={15} />清除</button>}
          </div>
          {data.settings.backgroundImage && <div className="background-preview" style={{ backgroundImage: `url(${data.settings.backgroundImage})` }} />}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-title"><Puzzle /><div><h2>布局与写作</h2><p>保留真正需要的信息。</p></div></div>
        <div className="layout-profile-row">{(['writing', 'minimal', 'custom'] as const).map((profile) => <button className={data.settings.layoutProfile === profile ? 'active' : ''} key={profile} onClick={() => setLayoutProfile(profile)}>{profile === 'writing' ? '写作' : profile === 'minimal' ? '极简' : '自定义'}</button>)}</div>
        <div className="setting-row"><div><strong>显示写作右侧栏</strong><span>字数、版本和章节信息</span></div><button className={data.settings.showRightPanel ? 'switch on' : 'switch'} onClick={toggleRightPanel}><i /></button></div>
        <div className="setting-row"><div><strong>显示音乐播放器</strong><span>隐藏控件不会中断已经允许的播放</span></div><button className={data.settings.music.playerVisible ? 'switch on' : 'switch'} onClick={() => setMusicSettings({ playerVisible: !data.settings.music.playerVisible })}><i /></button></div>
        <label className="setting-row"><div><strong>每日字数目标</strong><span>仅展示进度，不做强提醒</span></div><input type="number" min="0" step="100" value={data.settings.dailyTarget} onChange={(event) => setDailyTarget(Number(event.target.value))} /></label>
        <div className="navigation-order"><strong>导航顺序</strong>{data.settings.navigationOrder.map((view, index) => <div key={view}><span>{navigationItems.find((item) => item.id === view)?.label ?? view}</span><span><button disabled={index === 0} onClick={() => moveNavigation(view, -1)}>↑</button><button disabled={index === data.settings.navigationOrder.length - 1} onClick={() => moveNavigation(view, 1)}>↓</button></span></div>)}</div>
      </section>

      <section className="settings-section"><div className="settings-title"><Sparkles /><div><h2>模块</h2><p>停用模块不会删除已有数据，也不会擅自停止或清空内容。</p></div></div><div className="module-list"><div><span className="module-icon writing"><BookGlyph /></span><p><strong>写作</strong><small>作品、资料与时间线</small></p><button className={data.settings.modules.find((item) => item.id === 'writing')?.enabled ? 'switch on' : 'switch'} onClick={() => toggleModule('writing')}><i /></button></div><div><span className="module-icon"><Music2 /></span><p><strong>音乐</strong><small>本地曲库与四层播放上下文</small></p><button className={data.settings.modules.find((item) => item.id === 'music')?.enabled ? 'switch on' : 'switch'} onClick={() => toggleModule('music')}><i /></button></div><div><span className="module-icon"><Sparkles /></span><p><strong>虚拟伙伴</strong><small>编辑器侧栏与逐项权限</small></p><button className={data.settings.modules.find((item) => item.id === 'companion')?.enabled ? 'switch on' : 'switch'} onClick={() => toggleModule('companion')}><i /></button></div></div></section>
      </SettingsCategory>
      <SettingsCategory id="intelligence" title="智能创作" description="AI 服务、伙伴权限、形象记忆与成长" icon={<Sparkles />}>
      <IntelligenceSettingsHub />
      </SettingsCategory>
      <SettingsCategory id="data" title="数据管理" description="完整备份、恢复和开放格式迁移" icon={<Database />}>
      <BackupSettingsSection />
      <TransferSettingsSection />
      </SettingsCategory>
      <SettingsCategory id="privacy" title="隐私与安全" description="作品加密、本地存储和云端边界" icon={<LockKeyhole />}>
      <EncryptionSettingsSection />
      <section className="settings-section"><div className="settings-title"><ShieldCheck /><div><h2>数据与隐私</h2><p>本地资料由事务、备份和作品级加密共同保护。</p></div></div><div className="safety-grid"><div><Database /><strong>SQLite 本地资料库</strong><span>事务写入与修订冲突保护</span></div><div><LockKeyhole /><strong>作品级加密</strong><span>Argon2id + XChaCha20-Poly1305，加密后不保留正文索引</span></div><div><Cloud /><strong>云端同步</strong><span>仅完成 provider 协议占位；当前没有同步按钮，也不会上传数据</span></div></div></section>
      </SettingsCategory>
    </main>
  )
}

function BookGlyph() { return <span className="book-glyph">文</span> }
