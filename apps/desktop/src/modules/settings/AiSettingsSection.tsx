import { Check, KeyRound, Sparkles, Trash2, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createAiProvider, deleteAiKey, hasAiKey, storeAiKey } from '../../infrastructure/aiProvider'
import { useLibraryStore } from '../../state/useLibraryStore'

export function AiSettingsSection() {
  const { data, setAiSettings } = useLibraryStore()
  const [key, setKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [message, setMessage] = useState('Mock Provider 完全离线，用于安全验证候选与确认流程。')
  useEffect(() => { void hasAiKey().then(setKeySaved) }, [])

  const saveKey = async () => { try { await storeAiKey(key); setKey(''); setKeySaved(true); setMessage('API Key 已由 Windows DPAPI 保护，不进入资料库、日志或备份。') } catch (error) { setMessage(error instanceof Error ? error.message : '密钥保存失败') } }
  const test = async () => { try { setMessage(await createAiProvider(data.settings.ai).testConnection()) } catch (error) { setMessage(error instanceof Error ? error.message : '连接测试失败') } }

  return <section className="settings-section intelligence-section"><div className="settings-title"><Sparkles /><div><h2>AI 印象图服务</h2><p>只在你确认发送预览并手动生成时调用；普通图片完全不依赖 AI。</p></div></div>
    <label className="setting-row"><div><strong>Provider</strong><span>尚未指定真实服务时建议保留本地 Mock</span></div><select value={data.settings.ai.providerId} onChange={(event) => setAiSettings({ providerId: event.target.value as 'mock' | 'custom' })}><option value="mock">本地 Mock（离线）</option><option value="custom">自定义 HTTPS Provider</option></select></label>
    {data.settings.ai.providerId === 'custom' && <><label className="setting-row"><div><strong>服务地址</strong><span>必须使用 HTTPS；不会把 Key 写进此字段</span></div><input value={data.settings.ai.endpoint} placeholder="https://…" onChange={(event) => setAiSettings({ endpoint: event.target.value })} /></label><label className="setting-row"><div><strong>模型 ID</strong><span>由服务商提供</span></div><input value={data.settings.ai.model} onChange={(event) => setAiSettings({ model: event.target.value })} /></label><div className="secret-setting"><KeyRound /><input type="password" autoComplete="off" value={key} placeholder={keySaved ? '已安全保存；输入可替换' : '输入 API Key'} onChange={(event) => setKey(event.target.value)} /><button disabled={!key} onClick={() => void saveKey()}>{keySaved ? '替换' : '保存'}</button>{keySaved && <button title="删除密钥" onClick={() => void deleteAiKey().then(() => { setKeySaved(false); setMessage('API Key 已删除。') })}><Trash2 size={14} /></button>}</div></>}
    <div className="provider-test"><button className="ghost-button" onClick={() => void test()}><Wifi size={14} />连接测试</button><span>{keySaved && <Check size={12} />}{message}</span></div>
  </section>
}
