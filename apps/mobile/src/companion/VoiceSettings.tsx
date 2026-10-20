import { useEffect, useState } from 'react'
export function VoiceSettings() {
  const [key, setKey] = useState(''),
    [voice, setVoice] = useState(() => localStorage.getItem('yiyu.mobile.voice-id') ?? ''),
    [message, setMessage] = useState('')
  const [ready, setReady] = useState(() => window.YiyuMobile?.voiceConfigured?.() ?? false)
  useEffect(() => {
    const refresh = () => { setReady(window.YiyuMobile?.voiceConfigured?.() ?? false); setVoice(localStorage.getItem('yiyu.mobile.voice-id') ?? '') }
    window.addEventListener('yiyu-config-updated', refresh)
    return () => window.removeEventListener('yiyu-config-updated', refresh)
  }, [])
  return (
    <section className="paper-card">
      <p className="eyebrow">有声的陪伴，明确的边界</p>
      <h2>和小鱼说话</h2>
      <p className="footnote">
        {ready ? '手机语音已配置' : '手机语音尚未配置'} · 沿用 ElevenLabs，按你的账户额度计费。
      </p>
      <label>
        ElevenLabs API Key
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder={ready ? '留空沿用已存密钥' : '只保存在这台手机'}
        />
      </label>
      <label>
        声音 Voice ID
        <input
          autoComplete="off"
          spellCheck={false}
          value={voice}
          onChange={(event) => setVoice(event.target.value)}
          placeholder="ElevenLabs 中已选声音的 ID"
        />
      </label>
      <div className="toolbar">
        <button
          disabled={
            !window.YiyuMobile?.saveVoiceConfig ||
            !/^[A-Za-z0-9_-]{10,100}$/.test(voice.trim()) ||
            (!ready && !key.trim())
          }
          onClick={() => {
            const ok = window.YiyuMobile?.saveVoiceConfig?.(key.trim(), voice.trim())
            setKey('')
            if (ok) {
              try {
                localStorage.setItem('yiyu.mobile.voice-id', voice.trim())
              } catch {
                /* Native config remains authoritative. */
              }
            }
            setReady(window.YiyuMobile?.voiceConfigured?.() ?? false)
            setMessage(
              ok ? '手机语音已保存，请到小鱼页轻点开启。' : '未能保存，请检查手机密钥与声音 ID。',
            )
          }}
        >
          保存手机语音
        </button>
        <button
          disabled={!ready}
          onClick={() => {
            const ok = window.YiyuMobile?.clearVoiceConfig?.()
            if (ok) setReady(false)
            setMessage(ok ? '语音已结束，手机语音密钥已删除。' : '未能删除，请重试。')
          }}
        >
          删除语音密钥
        </button>
      </div>
      {message && (
        <p className="footnote" role="status">
          {message}
        </p>
      )}
      <p className="footnote">
        明确开启后才录音：音频送 ElevenLabs 识别，识别文字与本会话最近几轮送 DeepSeek，回复文字送
        ElevenLabs
        朗读。原始音频只在内存处理，不写入手机资料库或中枢；服务商处理规则仍适用。可在配置交接中申请沿用兼容语音，不继承麦克风权限。
      </p>
      <p className="footnote">
        说话时暂停采集；锁屏、结束、异常或十分钟上限会停止，一分钟无话自动结束。首次需系统麦克风授权，启动可能短暂回到一隅；不承诺无通知或任意后台唤醒。
      </p>
    </section>
  )
}
