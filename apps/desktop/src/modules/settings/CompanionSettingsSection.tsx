import { CheckCircle2, KeyRound, LockKeyhole, Music2, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createCompanionProvider, deleteCompanionKey, hasCompanionKey, storeCompanionKey } from '../../infrastructure/companionProvider'
import { useLibraryStore } from '../../state/useLibraryStore'
import { CompanionVoiceSettings } from './CompanionVoiceSettings'

interface CompanionSettingsSectionProps {
  mode?: 'profile' | 'permissions'
}

export function CompanionSettingsSection({ mode = 'profile' }: CompanionSettingsSectionProps) {
  const { data, setCompanionProfile, setCompanionProvider, setCompanionPermissions } = useLibraryStore()
  const [message, setMessage] = useState('DeepSeek 仅连接官方 api.deepseek.com；自定义 Provider 暂不联网。')
  const [key, setKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const permissions = data.companion.permissions
  const onlineProvider = data.companion.provider.providerId !== 'mock'
  useEffect(() => { void hasCompanionKey().then(setKeySaved) }, [])

  const chooseProvider = (providerId: 'mock' | 'deepseek' | 'custom') => {
    if (providerId === 'deepseek') setCompanionProvider({ providerId, endpoint: 'https://api.deepseek.com', model: 'deepseek-chat' })
    else setCompanionProvider({ providerId })
  }
  const saveKey = async () => {
    try {
      await storeCompanionKey(key)
      setKey('')
      setKeySaved(true)
      setMessage('对话模型 API Key 已由 Windows 安全存储保护。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '密钥保存失败')
    }
  }
  const checkProvider = async () => {
    try { setMessage(await createCompanionProvider(data.companion.provider).testConnection()) }
    catch (error) { setMessage(error instanceof Error ? error.message : '配置检查失败') }
  }

  if (mode === 'permissions') {
    return <section className="settings-section intelligence-section">
      <div className="settings-title"><ShieldCheck /><div><h2>权限与调用记录</h2><p>读取遵循资料范围；写入操作即使开启也必须逐次确认。</p></div></div>
      <div className="settings-subsection">
        <div className="permission-list"><div><ShieldCheck /><span><strong>允许提出写入操作</strong><small>待办、日历、日记、章节和记忆仍会在执行前逐次确认；删除、密钥和系统操作始终禁止</small></span><button aria-label="允许伙伴提出写入操作" aria-pressed={permissions.writeActions} className={permissions.writeActions ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ writeActions: !permissions.writeActions })}><i /></button></div><div><ShieldCheck /><span><strong>人物资料只读查询</strong><small>允许 character.search 返回姓名、别名、简介与标签</small></span><button aria-label="允许伙伴读取资料概览" aria-pressed={permissions.records} className={permissions.records ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ records: !permissions.records })}><i /></button></div><div><Music2 /><span><strong>正在播放的音乐</strong><small>允许读取播放摘要；播放控制属于低风险界面操作</small></span><button aria-label="允许伙伴读取播放信息" aria-pressed={permissions.musicContext} className={permissions.musicContext ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ musicContext: !permissions.musicContext })}><i /></button></div></div>
        <details className="permission-scope-group"><summary><span>允许读取的作品</span><small>已授权 {permissions.workIds.length} 项</small></summary><div className="permission-scopes">{data.works.filter((work) => !work.deletedAt).map((work) => <label key={work.id}><input type="checkbox" checked={permissions.workIds.includes(work.id)} onChange={(event) => setCompanionPermissions({ workIds: event.target.checked ? [...permissions.workIds, work.id] : permissions.workIds.filter((id) => id !== work.id) })} /><span>{work.encrypted && <LockKeyhole size={12} />} {work.title}</span><small>{work.encrypted ? '仍需本次会话许可' : '只读授权'}</small></label>)}</div></details>
        <details className="permission-scope-group"><summary><span>只允许特定章节</span><small>已授权 {permissions.chapterIds.length} 项</small></summary><div className="permission-scopes">{Object.values(data.chapters).filter((chapter) => !chapter.deletedAt).map((chapter) => { const work = data.works.find((item) => item.id === chapter.workId); return <label key={chapter.id}><input type="checkbox" checked={permissions.chapterIds.includes(chapter.id)} onChange={(event) => setCompanionPermissions({ chapterIds: event.target.checked ? [...permissions.chapterIds, chapter.id] : permissions.chapterIds.filter((id) => id !== chapter.id) })} /><span>{chapter.title}</span><small>{work?.title ?? '未知作品'} · 最多读取前 4000 字</small></label> })}</div></details>
        <details className="permission-scope-group"><summary><span>最近 Tool 审计</span><small>{data.companion.agentAudit.length} 条</small></summary><div className="agent-audit-list">{data.companion.agentAudit.slice(-12).reverse().map((entry) => <div key={entry.id}><span><strong>{entry.toolName}</strong><small>{new Date(entry.timestamp).toLocaleString()} · {entry.permissionDecision === 'allowed' ? '已允许' : '已拒绝'} · {entry.durationMs} ms</small></span><b className={entry.resultStatus}>{entry.resultStatus === 'success' ? '成功' : entry.errorCode ?? '失败'}</b></div>)}{!data.companion.agentAudit.length && <p>还没有 Tool 调用记录。</p>}</div></details>
      </div>
    </section>
  }

  return <section className="settings-section intelligence-section">
    <div className="settings-title"><Sparkles /><div><h2>对话与 Agent 模型</h2><p>DeepSeek 用于对话与 Tool Calling；本地 Mock 可离线验证流程。</p></div></div>
    <div className="settings-subsection compact-settings-grid">
      <label className="setting-row"><div><strong>伙伴称呼</strong><span>最多 20 个字符</span></div><input value={data.companion.name} onChange={(event) => setCompanionProfile({ name: event.target.value.slice(0, 20) })} /></label>
      <label className="setting-row"><div><strong>回应气质</strong><span>影响伙伴状态文字</span></div><select value={data.companion.expression} onChange={(event) => setCompanionProfile({ expression: event.target.value as typeof data.companion.expression })}><option value="calm">安静</option><option value="warm">温暖</option><option value="thinking">思考</option></select></label>
    </div>
    <div className="settings-subsection">
      <label className="setting-row"><div><strong>对话 Provider</strong><span>DeepSeek 已支持对话与 Tool Calling</span></div><select value={data.companion.provider.providerId} onChange={(event) => chooseProvider(event.target.value as 'mock' | 'deepseek' | 'custom')}><option value="mock">本地 Mock（离线）</option><option value="deepseek">DeepSeek</option><option value="custom">其他兼容 Provider（暂不联网）</option></select></label>
      {onlineProvider && <><label className="setting-row"><div><strong>服务地址</strong><span>{data.companion.provider.providerId === 'deepseek' ? '仅允许 DeepSeek 官方地址' : '等待单独授权与协议适配'}</span></div><input readOnly={data.companion.provider.providerId === 'deepseek'} value={data.companion.provider.endpoint} placeholder="https://…" onChange={(event) => setCompanionProvider({ endpoint: event.target.value })} /></label><label className="setting-row"><div><strong>模型 ID</strong><span>DeepSeek 默认 deepseek-chat</span></div><input value={data.companion.provider.model} onChange={(event) => setCompanionProvider({ model: event.target.value })} /></label><div className="secret-setting"><KeyRound /><input type="password" autoComplete="off" value={key} placeholder={keySaved ? '对话 Key 已安全保存；输入可替换' : '输入对话模型 API Key'} onChange={(event) => setKey(event.target.value)} /><button disabled={!key} onClick={() => void saveKey()}>{keySaved ? '替换' : '保存'}</button>{keySaved && <button title="删除对话模型密钥" onClick={() => void deleteCompanionKey().then(() => { setKeySaved(false); setMessage('对话模型 API Key 已删除。') })}><Trash2 size={14} /></button>}</div></>}
      <div className="provider-test"><button className="ghost-button" onClick={() => void checkProvider()}><CheckCircle2 size={14} />检查配置</button><span>{message}</span></div>
      <CompanionVoiceSettings />
    </div>
  </section>
}
