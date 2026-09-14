import { CheckCircle2, LockKeyhole, Music2, ShieldCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { createCompanionProvider } from '../../infrastructure/companionProvider'
import { useLibraryStore } from '../../state/useLibraryStore'

export function CompanionSettingsSection() {
  const { data, setCompanionProfile, setCompanionProvider, setCompanionPermissions } = useLibraryStore()
  const [message, setMessage] = useState('默认不读取任何文稿；授权可随时撤销。')
  const permissions = data.companion.permissions
  const customProvider = data.companion.provider.providerId === 'custom'
  const checkProvider = async () => {
    try { setMessage(await createCompanionProvider(data.companion.provider).testConnection()) }
    catch (error) { setMessage(error instanceof Error ? error.message : '配置检查失败') }
  }

  return <section className="settings-section intelligence-section">
    <div className="settings-title"><Sparkles /><div><h2>伙伴与权限中心</h2><p>设置伙伴的呈现、对话方式与可读取范围。</p></div></div>

    <div className="settings-subsection">
      <div className="settings-subsection-heading"><strong>伙伴外观</strong><small>只改变侧栏中的称呼与静态表情</small></div>
      <label className="setting-row"><div><strong>伙伴称呼</strong><span>最多 20 个字符</span></div><input value={data.companion.name} onChange={(event) => setCompanionProfile({ name: event.target.value.slice(0, 20) })} /></label>
      <label className="setting-row"><div><strong>基础表情</strong><span>桌面形象和动作将在 M8 实现</span></div><select value={data.companion.expression} onChange={(event) => setCompanionProfile({ expression: event.target.value as typeof data.companion.expression })}><option value="calm">安静</option><option value="warm">温暖</option><option value="thinking">思考</option></select></label>
    </div>

    <div className="settings-subsection">
      <div className="settings-subsection-heading"><strong>对话服务</strong><small>{customProvider ? '协议占位 · 当前不会联网或发送内容' : '本地 Mock · 完全离线'}</small></div>
      <label className="setting-row"><div><strong>Provider</strong><span>真实在线协议尚未接入</span></div><select value={data.companion.provider.providerId} onChange={(event) => setCompanionProvider({ providerId: event.target.value as 'mock' | 'custom' })}><option value="mock">本地 Mock（不联网）</option><option value="custom">自定义（仅检查配置）</option></select></label>
      {customProvider && <><label className="setting-row"><div><strong>HTTPS Endpoint</strong><span>这里只检查 HTTPS 格式，不会访问地址</span></div><input value={data.companion.provider.endpoint} placeholder="https://…" onChange={(event) => setCompanionProvider({ endpoint: event.target.value })} /></label><label className="setting-row"><div><strong>模型 ID</strong><span>用于保留未来协议配置</span></div><input value={data.companion.provider.model} onChange={(event) => setCompanionProvider({ model: event.target.value })} /></label></>}
      <div className="provider-test"><button className="ghost-button" onClick={() => void checkProvider()}><CheckCircle2 size={14} />检查 Provider 配置</button><span>{message}</span></div>
    </div>

    <div className="settings-subsection">
      <div className="settings-subsection-heading"><strong>可读取内容</strong><small>默认全部拒绝；每项都可以单独撤销</small></div>
      <div className="permission-list"><div><ShieldCheck /><span><strong>人物、地点与时间线概览</strong><small>只发送数量，不发送资料正文</small></span><button aria-label="允许伙伴读取资料概览" aria-pressed={permissions.records} className={permissions.records ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ records: !permissions.records })}><i /></button></div><div><Music2 /><span><strong>正在播放的音乐</strong><small>只发送曲名与艺术家</small></span><button aria-label="允许伙伴读取播放信息" aria-pressed={permissions.musicContext} className={permissions.musicContext ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ musicContext: !permissions.musicContext })}><i /></button></div></div>
      <details className="permission-scope-group"><summary><span>允许读取的作品</span><small>已授权 {permissions.workIds.length} 项</small></summary><div className="permission-scopes">{data.works.filter((work) => !work.deletedAt).map((work) => <label key={work.id}><input type="checkbox" checked={permissions.workIds.includes(work.id)} onChange={(event) => setCompanionPermissions({ workIds: event.target.checked ? [...permissions.workIds, work.id] : permissions.workIds.filter((id) => id !== work.id) })} /><span>{work.encrypted && <LockKeyhole size={12} />} {work.title}</span><small>{work.encrypted ? '仍需本次会话许可' : '只读授权'}</small></label>)}</div></details>
      <details className="permission-scope-group"><summary><span>只允许特定章节</span><small>已授权 {permissions.chapterIds.length} 项</small></summary><div className="permission-scopes">{Object.values(data.chapters).filter((chapter) => !chapter.deletedAt).map((chapter) => { const work = data.works.find((item) => item.id === chapter.workId); return <label key={chapter.id}><input type="checkbox" checked={permissions.chapterIds.includes(chapter.id)} onChange={(event) => setCompanionPermissions({ chapterIds: event.target.checked ? [...permissions.chapterIds, chapter.id] : permissions.chapterIds.filter((id) => id !== chapter.id) })} /><span>{chapter.title}</span><small>{work?.title ?? '未知作品'} · 前 1200 字</small></label> })}</div></details>
    </div>
  </section>
}
