import { Check, KeyRound, Sparkles, Trash2, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createAiProvider, deleteAiKey, hasAiKey, storeAiKey } from '../../infrastructure/aiProvider'
import { useLibraryStore } from '../../state/useLibraryStore'

export function AiSettingsSection() {
  const { data, setAiSettings } = useLibraryStore()
  const [key, setKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [message, setMessage] = useState('OpenRouter 图像协议接入前不会发送提示词或图片。')
  const onlineProvider = data.settings.ai.providerId !== 'mock'
  useEffect(() => { void hasAiKey().then(setKeySaved) }, [])

  const chooseProvider = (providerId: 'mock' | 'openrouter' | 'custom') => {
    if (providerId === 'openrouter') setAiSettings({ providerId, endpoint: 'https://openrouter.ai/api/v1', model: 'openai/gpt-image-2' })
    else setAiSettings({ providerId })
  }
  const saveKey = async () => { try { await storeAiKey(key); setKey(''); setKeySaved(true); setMessage('图像模型 API Key 已由 Windows 安全存储保护。') } catch (error) { setMessage(error instanceof Error ? error.message : '密钥保存失败') } }
  const test = async () => { try { setMessage(await createAiProvider(data.settings.ai).testConnection()) } catch (error) { setMessage(error instanceof Error ? error.message : '配置检查失败') } }

  return <section className="settings-section intelligence-section"><div className="settings-title"><Sparkles /><div><h2>图像生成模型</h2><p>计划通过 OpenRouter 调用 OpenAI GPT Image；只在你主动生成时使用。</p></div></div>
    <div className="settings-subsection">
      <label className="setting-row"><div><strong>图像 Provider</strong><span>本地 Mock 可先验证候选与确认流程</span></div><select value={data.settings.ai.providerId} onChange={(event) => chooseProvider(event.target.value as 'mock' | 'openrouter' | 'custom')}><option value="mock">本地 Mock（离线）</option><option value="openrouter">OpenRouter · GPT Image</option><option value="custom">其他 HTTPS Provider</option></select></label>
      {onlineProvider && <><label className="setting-row"><div><strong>服务地址</strong><span>OpenRouter 默认使用统一 API 地址</span></div><input value={data.settings.ai.endpoint} placeholder="https://…" onChange={(event) => setAiSettings({ endpoint: event.target.value })} /></label><label className="setting-row"><div><strong>模型 ID</strong><span>可按 OpenRouter 当前可用模型调整</span></div><input value={data.settings.ai.model} onChange={(event) => setAiSettings({ model: event.target.value })} /></label><div className="secret-setting"><KeyRound /><input type="password" autoComplete="off" value={key} placeholder={keySaved ? '图像 Key 已安全保存；输入可替换' : '输入 OpenRouter API Key'} onChange={(event) => setKey(event.target.value)} /><button disabled={!key} onClick={() => void saveKey()}>{keySaved ? '替换' : '保存'}</button>{keySaved && <button title="删除图像模型密钥" onClick={() => void deleteAiKey().then(() => { setKeySaved(false); setMessage('图像模型 API Key 已删除。') })}><Trash2 size={14} /></button>}</div></>}
      <div className="provider-test"><button className="ghost-button" onClick={() => void test()}><Wifi size={14} />检查配置</button><span>{keySaved && <Check size={12} />}{message}</span></div>
    </div>
  </section>
}
