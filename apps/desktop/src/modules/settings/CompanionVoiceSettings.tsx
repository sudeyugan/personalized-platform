import { KeyRound, Mic2, Trash2, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { deleteCompanionVoiceKey, hasCompanionVoiceKey, storeCompanionVoiceKey } from '../../infrastructure/companionVoiceProvider'
import { useLibraryStore } from '../../state/useLibraryStore'

type VoiceProvider = 'none' | 'elevenlabs' | 'custom'

export function CompanionVoiceSettings() {
  const { data, setCompanionVoice } = useLibraryStore()
  const voice = data.companion.voice
  const [key, setKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [message, setMessage] = useState('默认关闭；启用后，录音和朗读文本才会发送给所选语音服务。')
  const provider = voice.stt.providerId === voice.tts.providerId ? voice.tts.providerId : 'custom'

  useEffect(() => { void hasCompanionVoiceKey().then(setKeySaved) }, [])

  const chooseProvider = (providerId: VoiceProvider) => {
    if (providerId === 'elevenlabs') {
      setCompanionVoice({
        stt: { providerId, endpoint: 'https://api.elevenlabs.io/v1/speech-to-text', model: voice.stt.model || 'scribe_v2' },
        tts: { providerId, endpoint: 'https://api.elevenlabs.io/v1/text-to-speech', model: voice.tts.model || 'eleven_flash_v2_5' },
      })
    } else {
      setCompanionVoice({ stt: { providerId }, tts: { providerId }, autoSpeak: providerId === 'none' ? false : voice.autoSpeak, wakeEnabled: providerId === 'none' ? false : voice.wakeEnabled })
    }
  }

  const saveKey = async () => {
    try {
      await storeCompanionVoiceKey(key)
      setKey('')
      setKeySaved(true)
      setMessage('ElevenLabs API Key 已由 Windows 安全存储保护。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '语音密钥保存失败')
    }
  }

  return <details className="voice-settings">
    <summary><span><Volume2 size={15} /><span><strong>语音交互</strong><small>{provider === 'elevenlabs' ? 'ElevenLabs · 识别与朗读' : provider === 'none' ? '未启用' : '预留其他 Provider'}</small></span></span><b>{voice.autoSpeak ? '自动朗读' : '按需使用'}</b></summary>
    <div className="voice-settings-body">
      <label className="setting-row"><div><strong>语音服务</strong><span>同一入口管理语音识别和语音合成</span></div><select value={provider} onChange={(event) => chooseProvider(event.target.value as VoiceProvider)}><option value="none">关闭</option><option value="elevenlabs">ElevenLabs</option><option value="custom">其他 Provider（预留）</option></select></label>
      {provider === 'elevenlabs' && <>
        <label className="setting-row"><div><strong>Voice ID</strong><span>使用 ElevenLabs 声音库中的 Voice ID</span></div><input value={voice.tts.voice} placeholder="例如 JBFqnCBsd6RMkjVDRZzb" onChange={(event) => setCompanionVoice({ tts: { voice: event.target.value.trim() } })} /></label>
        <div className="compact-settings-grid">
          <label className="setting-row"><div><strong><Volume2 size={13} />朗读模型</strong><span>默认低延迟多语言模型</span></div><input value={voice.tts.model} onChange={(event) => setCompanionVoice({ tts: { model: event.target.value.trim() } })} /></label>
          <label className="setting-row"><div><strong><Mic2 size={13} />识别模型</strong><span>默认 Scribe v2</span></div><input value={voice.stt.model} onChange={(event) => setCompanionVoice({ stt: { model: event.target.value.trim() } })} /></label>
        </div>
        <div className="secret-setting"><KeyRound /><input type="password" autoComplete="off" value={key} placeholder={keySaved ? '语音 Key 已安全保存；输入可替换' : '输入 ElevenLabs API Key'} onChange={(event) => setKey(event.target.value)} /><button disabled={!key.trim()} onClick={() => void saveKey()}>{keySaved ? '替换' : '保存'}</button>{keySaved && <button title="删除 ElevenLabs 密钥" onClick={() => void deleteCompanionVoiceKey().then(() => { setKeySaved(false); setMessage('ElevenLabs API Key 已删除。') })}><Trash2 size={14} /></button>}</div>
        <div className="setting-row"><div><strong>自动朗读伙伴回复</strong><span>关闭时仍可用麦克风输入；不会自动产生语音费用</span></div><button aria-pressed={voice.autoSpeak} className={voice.autoSpeak ? 'switch on' : 'switch'} onClick={() => setCompanionVoice({ autoSpeak: !voice.autoSpeak })}><i /></button></div>
        <div className="setting-row"><div><strong>语音唤醒「小鱼」</strong><span>开启后会持续使用麦克风与 ElevenLabs 转写；说“小鱼”后再说问题，伙伴会用精简模式回答</span></div><button aria-pressed={voice.wakeEnabled} className={voice.wakeEnabled ? 'switch on' : 'switch'} onClick={() => setCompanionVoice({ wakeEnabled: !voice.wakeEnabled })}><i /></button></div>
        <label className="setting-row"><div><strong>语音回答长度</strong><span>只影响从麦克风发起的问题</span></div><select value={voice.replyLength} onChange={(event) => setCompanionVoice({ replyLength: event.target.value as 'short' | 'standard' })}><option value="short">精简（3–5 句）</option><option value="standard">标准（通常不超过 8 句）</option></select></label>
        <label className="setting-row"><div><strong>长回答朗读</strong><span>文字始终完整显示；可只朗读前段</span></div><select value={voice.longReplySpeech} onChange={(event) => setCompanionVoice({ longReplySpeech: event.target.value as 'summary' | 'full' })}><option value="summary">只读前段</option><option value="full">完整朗读</option></select></label>
      </>}
      {provider === 'custom' && <p className="voice-provider-note">语音层已按 Provider 接口拆分；接入其他项目时只需增加适配器，无需修改伙伴窗口和对话流程。</p>}
      <p className="voice-provider-note">{message}</p>
    </div>
  </details>
}
