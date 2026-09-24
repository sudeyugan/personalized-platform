import { CheckCircle2, Globe2, KeyRound, LockKeyhole, Music2, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createCompanionProvider, deleteCompanionKey, hasCompanionKey, storeCompanionKey } from '../../infrastructure/companionProvider'
import { deleteWebSearchKey, hasWebSearchKey, searchWeb, storeWebSearchKey, type WebSearchProviderId } from '../../infrastructure/webSearch'
import { useLibraryStore } from '../../state/useLibraryStore'
import { CompanionVoiceSettings } from './CompanionVoiceSettings'
import { ComputerCapabilitySettings } from './ComputerCapabilitySettings'
import { assertExternalAiAllowed } from '../trust/trustPolicy'

interface CompanionSettingsSectionProps {
  mode?: 'profile' | 'permissions'
}

export function CompanionSettingsSection({ mode = 'profile' }: CompanionSettingsSectionProps) {
  const { data, setCompanionProfile, setCompanionProvider, setCompanionPermissions, setWebSearchSettings } = useLibraryStore()
  const [message, setMessage] = useState('DeepSeek 仅连接官方 api.deepseek.com；自定义 Provider 暂不联网。')
  const [key, setKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [webDiagnostic, setWebDiagnostic] = useState('尚未测试联网查询。')
  const [webKey, setWebKey] = useState('')
  const [webKeySaved, setWebKeySaved] = useState(false)
  const permissions = data.companion.permissions
  const onlineProvider = data.companion.provider.providerId !== 'mock'
  useEffect(() => { void hasCompanionKey().then(setKeySaved) }, [])

  useEffect(() => {
    if (data.settings.webSearch.providerId === 'bing') { setWebKeySaved(false); return }
    void hasWebSearchKey(data.settings.webSearch.providerId).then(setWebKeySaved)
  }, [data.settings.webSearch.providerId])

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
    try {
      assertExternalAiAllowed(data.companion.provider.providerId, data.settings.trust, 'companion')
      setMessage(await createCompanionProvider(data.companion.provider).testConnection())
    }
    catch (error) { setMessage(error instanceof Error ? error.message : '配置检查失败') }
  }
  const chooseWebSearchProvider = (providerId: WebSearchProviderId) => {
    setWebSearchSettings({ providerId })
    setWebKey('')
    setWebDiagnostic('尚未测试联网查询。')
  }
  const saveWebKey = async () => {
    const provider = data.settings.webSearch.providerId
    if (provider === 'bing') return
    try {
      await storeWebSearchKey(provider, webKey)
      setWebKey('')
      setWebKeySaved(true)
      setWebDiagnostic('搜索服务 API Key 已由 Windows 安全存储保护。')
    } catch (error) { setWebDiagnostic(error instanceof Error ? error.message : '搜索密钥保存失败') }
  }
  const removeWebKey = async () => {
    const provider = data.settings.webSearch.providerId
    if (provider === 'bing') return
    await deleteWebSearchKey(provider)
    setWebKeySaved(false)
    setWebDiagnostic('搜索服务 API Key 已删除。')
  }
  const checkWebSearch = async () => {
    const started = performance.now()
    setWebDiagnostic('正在测试所选搜索服务……')

    try {
      const results = await searchWeb('一隅 软件', data.settings.webSearch)
      const actual = results[0]?.provider
      const route = actual === 'bing-fallback' ? 'Bing 应急降级' : actual === 'tencent' ? '腾讯云' : '博查'
      setWebDiagnostic(`${route} · ${results.length} 条结果 · ${Math.round(performance.now() - started)} ms`)
    } catch (error) {
      setWebDiagnostic(error instanceof Error ? error.message : 'WEB_SEARCH_UNKNOWN')
    }
  }

  if (mode === 'permissions') {
    return <section className="settings-section intelligence-section">
      <div className="settings-title"><ShieldCheck /><div><h2>权限与调用记录</h2><p>每类私人数据独立授权；平衡模式会自动执行低风险操作。</p></div></div>
      <div className="settings-subsection">
        <div className="permission-list">
          <div><ShieldCheck /><span><strong>允许写入</strong><small>关闭后只读；删除、密钥和系统操作始终禁止</small></span><button aria-label="允许伙伴提出写入操作" aria-pressed={permissions.writeActions} className={permissions.writeActions ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ writeActions: !permissions.writeActions })}><i /></button></div>
          <label className="permission-policy-row"><ShieldCheck /><span><strong>写入确认方式</strong><small>平衡模式自动执行新建待办、日历事务、完成待办和情绪记录</small></span><select value={permissions.writePolicy} onChange={(event) => setCompanionPermissions({ writePolicy: event.target.value as typeof permissions.writePolicy })}><option value="balanced">平衡（推荐）</option><option value="always_ask">始终询问</option></select></label>
          <div><ShieldCheck /><span><strong>待办</strong><small>读取待办、周期完成记录与休假日</small></span><button aria-label="允许伙伴读取待办" aria-pressed={permissions.todos} className={permissions.todos ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ todos: !permissions.todos })}><i /></button></div>
          <div><ShieldCheck /><span><strong>日历事务</strong><small>读取日历中自行添加的事务</small></span><button aria-label="允许伙伴读取日历事务" aria-pressed={permissions.calendar} className={permissions.calendar ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ calendar: !permissions.calendar })}><i /></button></div>
          <div><ShieldCheck /><span><strong>课表</strong><small>读取课程、周次、教师与地点</small></span><button aria-label="允许伙伴读取课表" aria-pressed={permissions.courses} className={permissions.courses ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ courses: !permissions.courses })}><i /></button></div>
          <div><ShieldCheck /><span><strong>朝问</strong><small>读取最近保存的每日问题</small></span><button aria-label="允许伙伴读取朝问" aria-pressed={permissions.dailyQuestions} className={permissions.dailyQuestions ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ dailyQuestions: !permissions.dailyQuestions })}><i /></button></div>
          <div><ShieldCheck /><span><strong>日记</strong><small>读取日记标题、摘要和正文</small></span><button aria-label="允许伙伴读取日记" aria-pressed={permissions.diary} className={permissions.diary ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ diary: !permissions.diary })}><i /></button></div>
          <div><ShieldCheck /><span><strong>情绪记录</strong><small>读取每日以及周、月情绪回望</small></span><button aria-label="允许伙伴读取情绪" aria-pressed={permissions.mood} className={permissions.mood ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ mood: !permissions.mood })}><i /></button></div>
          <div><ShieldCheck /><span><strong>人物、地点与时间线</strong><small>不包含创作素材文件</small></span><button aria-label="允许伙伴读取资料概览" aria-pressed={permissions.records} className={permissions.records ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ records: !permissions.records })}><i /></button></div>
          <div><ShieldCheck /><span><strong>伙伴记忆</strong><small>只读取明确授权保留的记忆</small></span><button aria-label="允许伙伴读取记忆" aria-pressed={permissions.memories} className={permissions.memories ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ memories: !permissions.memories })}><i /></button></div>
          <div><ShieldCheck /><span><strong>答案之书收藏</strong><small>读取主动收藏的问题与答案</small></span><button aria-label="允许伙伴读取答案收藏" aria-pressed={permissions.answerBook} className={permissions.answerBook ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ answerBook: !permissions.answerBook })}><i /></button></div>
          <div><Globe2 /><span><strong>联网查询</strong><small>只发送查询词；不携带日记、对话上下文或本地文件</small></span><button aria-label="允许伙伴联网查询" aria-pressed={permissions.internet} className={permissions.internet ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ internet: !permissions.internet })}><i /></button></div>
          <div className="web-search-provider"><Globe2 /><span><strong>搜索服务</strong><small>腾讯云适合长期使用；博查可用于对比效果</small></span><select value={data.settings.webSearch.providerId} onChange={(event) => chooseWebSearchProvider(event.target.value as WebSearchProviderId)}><option value="tencent">腾讯云 · 轻量版</option><option value="bocha">博查 Web Search</option><option value="bing">Bing · 无密钥应急</option></select></div>
          {data.settings.webSearch.providerId !== 'bing' && <div className="web-search-key"><KeyRound /><span><strong>搜索 API Key</strong><small>{webKeySaved ? '已安全保存；输入新 Key 可替换' : '只保存在 Windows 安全存储中'}</small></span><span className="web-search-key-actions"><input type="password" autoComplete="off" value={webKey} placeholder={webKeySaved ? '已保存' : '输入 API Key'} onChange={(event) => setWebKey(event.target.value)} /><button disabled={!webKey} onClick={() => void saveWebKey()}>{webKeySaved ? '替换' : '保存'}</button>{webKeySaved && <button title="删除搜索服务密钥" onClick={() => void removeWebKey()}><Trash2 size={14} /></button>}</span></div>}
          <div className="web-search-fallback"><ShieldCheck /><span><strong>失败时应急降级</strong><small>所选服务不可用时临时使用 Bing RSS，并在诊断中明确标注</small></span><button aria-label="允许搜索失败时应急降级" aria-pressed={data.settings.webSearch.fallbackToBing} className={data.settings.webSearch.fallbackToBing ? 'switch on' : 'switch'} onClick={() => setWebSearchSettings({ fallbackToBing: !data.settings.webSearch.fallbackToBing })}><i /></button></div>
          <div className="web-search-diagnostic"><Globe2 /><span><strong>联网诊断</strong><small>{webDiagnostic}</small></span><button className="ghost-button quiet" onClick={() => void checkWebSearch()}>测试</button></div>
          <div><Music2 /><span><strong>正在播放的音乐</strong><small>允许读取播放摘要；播放控制属于低风险界面操作</small></span><button aria-label="允许伙伴读取播放信息" aria-pressed={permissions.musicContext} className={permissions.musicContext ? 'switch on' : 'switch'} onClick={() => setCompanionPermissions({ musicContext: !permissions.musicContext })}><i /></button></div>
        </div>
        <details className="permission-scope-group"><summary><span>允许读取的作品</span><small>已授权 {permissions.workIds.length} 项</small></summary><div className="permission-scopes">{data.works.filter((work) => !work.deletedAt).map((work) => <label key={work.id}><input type="checkbox" checked={permissions.workIds.includes(work.id)} onChange={(event) => setCompanionPermissions({ workIds: event.target.checked ? [...permissions.workIds, work.id] : permissions.workIds.filter((id) => id !== work.id) })} /><span>{work.encrypted && <LockKeyhole size={12} />} {work.title}</span><small>{work.encrypted ? '仍需本次会话许可' : '只读授权'}</small></label>)}</div></details>
        <details className="permission-scope-group"><summary><span>只允许特定章节</span><small>已授权 {permissions.chapterIds.length} 项</small></summary><div className="permission-scopes">{Object.values(data.chapters).filter((chapter) => !chapter.deletedAt).map((chapter) => { const work = data.works.find((item) => item.id === chapter.workId); return <label key={chapter.id}><input type="checkbox" checked={permissions.chapterIds.includes(chapter.id)} onChange={(event) => setCompanionPermissions({ chapterIds: event.target.checked ? [...permissions.chapterIds, chapter.id] : permissions.chapterIds.filter((id) => id !== chapter.id) })} /><span>{chapter.title}</span><small>{work?.title ?? '未知作品'} · 最多读取前 4000 字</small></label> })}</div></details>
        <ComputerCapabilitySettings />
        <details className="permission-scope-group"><summary><span>最近 Tool 审计</span><small>{data.companion.agentAudit.length} 条</small></summary><div className="agent-audit-list">{data.companion.agentAudit.slice(-12).reverse().map((entry) => <div key={entry.id}><span><strong>{entry.toolName}</strong><small>{new Date(entry.timestamp).toLocaleString()} · {entry.permissionDecision === 'allowed' ? '已允许' : '已拒绝'} · {entry.durationMs} ms</small>{entry.target && <em>{entry.confirmed ? '本次确认' : '按规则执行'} · {entry.target}</em>}{entry.errorDetail && <em>{entry.errorDetail}</em>}</span><b className={entry.resultStatus}>{entry.resultStatus === 'success' ? '成功' : entry.errorCode ?? '失败'}</b></div>)}{!data.companion.agentAudit.length && <p>还没有 Tool 调用记录。</p>}</div></details>
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
