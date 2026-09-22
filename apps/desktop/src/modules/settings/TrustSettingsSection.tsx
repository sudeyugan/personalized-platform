import { CloudOff, Database, KeyRound, Plus, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import type { PrivateDictionaryCategory } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'
import { trustBoundarySummary } from '../trust/trustPolicy'

export function TrustSettingsSection() {
  const { data, setTrustSettings, setCompanionVoice } = useLibraryStore()
  const trust = data.settings.trust
  const [privateValue, setPrivateValue] = useState('')
  const [privateCategory, setPrivateCategory] = useState<PrivateDictionaryCategory>('person')
  const setExternalProcessing = (allowed: boolean) => {
    setTrustSettings({ externalAiProcessing: allowed })
    if (!allowed && data.companion.voice.wakeEnabled) setCompanionVoice({ wakeEnabled: false })
  }
  return <section className="settings-section trust-settings">
    <div className="settings-title"><ShieldCheck /><div><h2>隐私与信任边界</h2><p>先决定哪些数据可以离开本机，再由 Agent 权限决定可以执行什么。</p></div></div>
    <div className={`trust-egress-status ${trust.externalAiProcessing ? 'online' : 'local'}`}>
      {trust.externalAiProcessing ? <Database size={16} /> : <CloudOff size={16} />}
      <span><strong>{trust.externalAiProcessing ? '已允许外部 AI 处理' : '本地优先模式'}</strong><small>{trust.externalAiProcessing ? 'DeepSeek 与已配置的语音服务可接收经过裁剪的数据。' : 'DeepSeek、朝问和在线语音会在请求发出前被本地阻止；本地 Mock 仍可使用。'}</small></span>
    </div>
    <div className="trust-controls">
      <div className="setting-row"><div><strong>允许外部 AI 处理</strong><span>控制 DeepSeek、朝问和在线语音的总出口</span></div><button aria-label="允许外部 AI 处理" aria-pressed={trust.externalAiProcessing} className={trust.externalAiProcessing ? 'switch on' : 'switch'} onClick={() => setExternalProcessing(!trust.externalAiProcessing)}><i /></button></div>
      <div className="setting-row"><div><strong>携带已授权上下文</strong><span>仅包含已在 AI 伙伴权限中授权的当前作品或章节摘要</span></div><button aria-label="携带已授权上下文" aria-pressed={trust.shareAuthorizedContext} className={trust.shareAuthorizedContext ? 'switch on' : 'switch'} onClick={() => setTrustSettings({ shareAuthorizedContext: !trust.shareAuthorizedContext })}><i /></button></div>
      <div className="setting-row"><div><strong>携带最近对话</strong><span>关闭后每次模型请求只看到当前消息，不发送之前的聊天</span></div><button aria-label="携带最近对话" aria-pressed={trust.shareRecentConversation} className={trust.shareRecentConversation ? 'switch on' : 'switch'} onClick={() => setTrustSettings({ shareRecentConversation: !trust.shareRecentConversation })}><i /></button></div>
      <div className="setting-row"><div><strong>在本地保留伙伴对话</strong><span>关闭后新消息只在本次打开期间显示，不写入资料库或备份</span></div><button aria-label="在本地保留伙伴对话" aria-pressed={trust.retainConversationHistory} className={trust.retainConversationHistory ? 'switch on' : 'switch'} onClick={() => setTrustSettings({ retainConversationHistory: !trust.retainConversationHistory })}><i /></button></div>
      <div className="setting-row"><div><strong>发送前确认</strong><span>平衡模式仅在识别到隐私内容时确认；严格模式每次都确认</span></div><select aria-label="发送前确认模式" value={trust.outboundReviewMode} onChange={(event) => setTrustSettings({ outboundReviewMode: event.target.value as typeof trust.outboundReviewMode })}><option value="balanced">发现隐私时</option><option value="strict">每次发送</option></select></div>
    </div>
    <div className="private-dictionary">
      <header><span><strong>私密词典</strong><small>为真实姓名、地点或项目名设置稳定化名；词典仅保存在本地资料库。</small></span><b>{trust.privateDictionary.length} 项</b></header>
      <form onSubmit={(event) => { event.preventDefault(); const value = privateValue.trim(); if (value.length < 2 || trust.privateDictionary.some((item) => item.value === value)) return; setTrustSettings({ privateDictionary: [...trust.privateDictionary, { id: `private-${crypto.randomUUID()}`, value, category: privateCategory, enabled: true }] }); setPrivateValue('') }}>
        <input aria-label="私密词" value={privateValue} onChange={(event) => setPrivateValue(event.target.value)} placeholder="例如真实姓名或项目代号" />
        <select aria-label="私密词类别" value={privateCategory} onChange={(event) => setPrivateCategory(event.target.value as PrivateDictionaryCategory)}><option value="person">人物</option><option value="place">地点</option><option value="organization">组织</option><option value="project">项目</option><option value="account">账号</option><option value="other">其他</option></select>
        <button aria-label="添加私密词" disabled={privateValue.trim().length < 2}><Plus size={14} />添加</button>
      </form>
      {trust.privateDictionary.length > 0 && <div className="private-dictionary-list">{trust.privateDictionary.map((item) => <div key={item.id}><button className={item.enabled ? 'private-chip enabled' : 'private-chip'} onClick={() => setTrustSettings({ privateDictionary: trust.privateDictionary.map((entry) => entry.id === item.id ? { ...entry, enabled: !entry.enabled } : entry) })}><span>{item.value}</span><small>{item.enabled ? '保护中' : '已停用'}</small></button><button aria-label={`删除${item.value}`} onClick={() => setTrustSettings({ privateDictionary: trust.privateDictionary.filter((entry) => entry.id !== item.id) })}><X size={12} /></button></div>)}</div>}
    </div>
    <p className="trust-voice-boundary">语音识别服务会先接收原始音频，无法用文本规则预先脱敏；转写后的文字、模型请求和发给语音合成的文字会经过本地保护。</p>
    <div className="trust-boundary-grid">{trustBoundarySummary.map((item, index) => <div key={item.id}>{index === 0 ? <KeyRound size={15} /> : <ShieldCheck size={15} />}<span><strong>{item.title}</strong><small>{item.detail}</small></span></div>)}</div>
  </section>
}
