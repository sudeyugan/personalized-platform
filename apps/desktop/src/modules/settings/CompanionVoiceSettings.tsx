import { Download, Fingerprint, KeyRound, Mic2, Trash2, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { deleteCompanionVoiceKey, hasCompanionVoiceKey, storeCompanionVoiceKey } from '../../infrastructure/companionVoiceProvider'
import { captureSpeakerSample, localVoice, type LocalVoiceInstallSnapshot, type LocalVoiceStatus } from '../../infrastructure/localVoice'
import { useLibraryStore } from '../../state/useLibraryStore'

type VoiceProvider = 'none' | 'elevenlabs' | 'custom'

export function CompanionVoiceSettings() {
  const { data, setCompanionVoice } = useLibraryStore()
  const voice = data.companion.voice
  const [key, setKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [message, setMessage] = useState('默认关闭；启用后，录音和朗读文本才会发送给所选语音服务。')
  const [localStatus, setLocalStatus] = useState<LocalVoiceStatus>({ modelsInstalled: false, speakerEnrolled: false, modelBytes: 0 })
  const [localBusy, setLocalBusy] = useState(false)
  const [modelInstall, setModelInstall] = useState<LocalVoiceInstallSnapshot>({ active: false, cancelling: false })
  const [localMessage, setLocalMessage] = useState('本地模型尚未检查。')
  const provider = voice.stt.providerId === voice.tts.providerId ? voice.tts.providerId : 'custom'

  useEffect(() => {
    void hasCompanionVoiceKey().then(setKeySaved)
    void localVoice.status().then((status) => { setLocalStatus(status); setLocalMessage(status.modelsInstalled ? status.speakerEnrolled ? '本地模型和声纹均已就绪。' : '本地模型已就绪，请录入声纹。' : '首次使用需要下载约 43 MB 的本地模型。') }).catch(() => setLocalMessage('请在 Windows 桌面版中配置本地唤醒。'))
    return localVoice.subscribeInstall((snapshot) => {
      setModelInstall(snapshot)
      if (snapshot.error) {
        setLocalMessage(snapshot.error.replace(/^[A-Z_]+:/, ''))
        return
      }
      const progress = snapshot.progress
      if (!progress) return
      const action = progress.phase === 'connecting' ? '正在连接' : progress.phase === 'downloading' ? '正在下载' : progress.phase === 'verifying' ? '正在校验' : progress.phase === 'retrying' ? '连接失败，正在重试' : progress.phase === 'switching' ? '正在切换备用源' : '下载完成'
      setLocalMessage(action + '：' + progress.label + '（' + progress.fileIndex + '/' + progress.fileCount + '）')
    })
  }, [])

  const installLocalModels = async () => {
    setLocalMessage('正在从官方源下载并校验模型；连接不稳定时会自动重试并切换备用源…')
    try {
      const status = await localVoice.install(voice.modelDownloadSource)
      setLocalStatus(status)
      setLocalMessage('本地模型已安装并通过完整性校验。')
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message.replace(/^[A-Z_]+:/, '') : String(error))
    }
  }

  const enrollSpeaker = async () => {
    if (!localStatus.modelsInstalled) { setLocalMessage('请先下载本地模型。'); return }
    setLocalBusy(true)
    const prompts = [`请清楚说“${voice.wakeWord}”`, `请再次说“${voice.wakeWord}”`, '请自然说：今天我想安静地写一点东西', '请再自然说一句你常用的话']
    try {
      const samples: number[][] = []
      for (let index = 0; index < prompts.length; index += 1) {
        setLocalMessage(`${prompts[index]}（${index + 1}/${prompts.length}，约 3 秒）`)
        await new Promise((resolve) => window.setTimeout(resolve, 850))
        samples.push(await captureSpeakerSample())
      }
      setLocalMessage('正在本机生成声纹，原始录音不会保存…')
      const status = await localVoice.enroll(samples)
      setLocalStatus(status)
      setLocalMessage('声纹录入完成；四段原始录音已从内存释放。')
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message.replace(/^[A-Z_]+:/, '') : String(error))
    } finally { setLocalBusy(false) }
  }

  const toggleWake = () => {
    if (!voice.wakeEnabled && (!localStatus.modelsInstalled || (voice.speakerVerification && !localStatus.speakerEnrolled))) {
      setLocalMessage(!localStatus.modelsInstalled ? '请先下载本地模型。' : '请先录入声纹，再开启唤醒。')
      return
    }
    setCompanionVoice({ wakeEnabled: !voice.wakeEnabled })
  }

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
        <section className="local-voice-settings">
          <header><Fingerprint size={16} /><span><strong>本地唤醒与声纹</strong><small>待机检测完全留在本机，通过后才连接 ElevenLabs</small></span><b>{localStatus.modelsInstalled ? localStatus.speakerEnrolled ? '已就绪' : '待录入' : '未安装'}</b></header>
          <div className="local-voice-grid">
            <label><span>自定义唤醒词<small>二至六个汉字，避免日常高频词</small></span><input value={voice.wakeWord} maxLength={6} disabled={voice.wakeEnabled} onChange={(event) => setCompanionVoice({ wakeWord: event.target.value.replace(/[^\u4e00-\u9fff]/g, '').slice(0, 6) })} /></label>
            <label><span>唤醒灵敏度<small>越高越容易唤醒，也更可能误触发</small></span><select value={voice.wakeSensitivity} disabled={voice.wakeEnabled} onChange={(event) => setCompanionVoice({ wakeSensitivity: event.target.value as typeof voice.wakeSensitivity })}><option value="low">低</option><option value="standard">标准</option><option value="high">高</option></select></label>
            <label><span>模型下载源<small>国内优先速度更快；自动模式失败后切全球源</small></span><select value={voice.modelDownloadSource} disabled={modelInstall.active} onChange={(event) => setCompanionVoice({ modelDownloadSource: event.target.value as typeof voice.modelDownloadSource })}><option value="china">国内优先</option><option value="auto">自动切换</option><option value="global">GitHub / Hugging Face</option></select></label>
          </div>
          <div className="setting-row"><div><strong>只响应已录入的声音</strong><span>声纹仅用于减少误唤醒，不能替代高风险操作确认</span></div><button aria-pressed={voice.speakerVerification} className={voice.speakerVerification ? 'switch on' : 'switch'} disabled={voice.wakeEnabled} onClick={() => setCompanionVoice({ speakerVerification: !voice.speakerVerification })}><i /></button></div>
          <div className="local-voice-actions">
            {!localStatus.modelsInstalled && <button disabled={localBusy || modelInstall.active} onClick={() => void installLocalModels()}><Download size={13} />{modelInstall.active ? '正在下载…' : '下载本地模型'}</button>}
            {modelInstall.active && <button className="quiet" disabled={modelInstall.cancelling} onClick={() => void localVoice.cancelInstall()}>{modelInstall.cancelling ? '正在取消…' : '取消下载'}</button>}
            {localStatus.modelsInstalled && <button disabled={localBusy || modelInstall.active || voice.wakeEnabled} onClick={() => void enrollSpeaker()}><Mic2 size={13} />{localBusy ? '正在录入…' : localStatus.speakerEnrolled ? '重新录入声纹' : '录入声纹'}</button>}
            {localStatus.speakerEnrolled && <button className="quiet" disabled={localBusy || modelInstall.active || voice.wakeEnabled} onClick={() => void localVoice.deleteProfile().then((status) => { setLocalStatus(status); setLocalMessage('本地声纹已删除。'); setCompanionVoice({ wakeEnabled: false }) })}><Trash2 size={13} />删除声纹</button>}
          </div>
          {modelInstall.active && modelInstall.progress && <div className="local-voice-download-progress">
            <div><span>{modelInstall.progress.label}</span><b>{modelInstall.progress.percent == null ? '连接中' : modelInstall.progress.percent + '%'}</b></div>
            <progress max={100} value={modelInstall.progress.percent ?? undefined} aria-label={modelInstall.progress.label + '下载进度'} />
            <small>{modelInstall.progress.source} · 第 {modelInstall.progress.fileIndex}/{modelInstall.progress.fileCount} 个文件{modelInstall.progress.totalBytes ? ' · ' + (modelInstall.progress.downloadedBytes / 1024 / 1024).toFixed(1) + ' / ' + (modelInstall.progress.totalBytes / 1024 / 1024).toFixed(1) + ' MB' : ''}</small>
          </div>}
          <p>{localMessage}</p>
        </section>
        <div className="setting-row"><div><strong>语音唤醒「{voice.wakeWord || '未设置'}」</strong><span>待机只做本地识别；唤醒并通过声纹后，再说问题并进入约 45 秒连续对话</span></div><button aria-pressed={voice.wakeEnabled} className={voice.wakeEnabled ? 'switch on' : 'switch'} onClick={toggleWake}><i /></button></div>
        <label className="setting-row"><div><strong>语音回答长度</strong><span>只影响从麦克风发起的问题</span></div><select value={voice.replyLength} onChange={(event) => setCompanionVoice({ replyLength: event.target.value as 'short' | 'standard' })}><option value="short">精简（3–5 句）</option><option value="standard">标准（通常不超过 8 句）</option></select></label>
        <label className="setting-row"><div><strong>长回答朗读</strong><span>文字始终完整显示；可只朗读前段</span></div><select value={voice.longReplySpeech} onChange={(event) => setCompanionVoice({ longReplySpeech: event.target.value as 'summary' | 'full' })}><option value="summary">只读前段</option><option value="full">完整朗读</option></select></label>
      </>}
      {provider === 'custom' && <p className="voice-provider-note">语音层已按 Provider 接口拆分；接入其他项目时只需增加适配器，无需修改伙伴窗口和对话流程。</p>}
      <p className="voice-provider-note">{message}</p>
    </div>
  </details>
}
