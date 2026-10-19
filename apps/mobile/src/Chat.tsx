import { useEffect, useState } from 'react'
export function Chat() {
  const [input, setInput] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState('')
  useEffect(() => {
    const listener = (event: Event) => {
      const result = (event as CustomEvent<{ id: string; content: string }>).detail
      if (result.id === busy) { setReply(result.content); setBusy('') }
    }
    window.addEventListener('yiyu-chat-result', listener)
    const timer = busy ? setTimeout(() => { setBusy(''); setReply('这次没有及时接通，可以稍后再试。') }, 50_000) : undefined
    return () => { window.removeEventListener('yiyu-chat-result', listener); clearTimeout(timer) }
  }, [busy])
  return <section className="phone-chat"><h2>小鱼在这里</h2><p className="footnote">仅发送你按下发送的本次文字给 DeepSeek，不读取同步资料或其他应用。对话不保存到中枢；手机没有电脑控制权限。</p>{reply && <article className="record"><p>{reply}</p></article>}<textarea aria-label="给小鱼的话" maxLength={3000} value={input} onChange={e => setInput(e.target.value)} placeholder="说点什么…"/><button disabled={!window.YiyuMobile || Boolean(busy) || !input.trim()} onClick={() => { const id = crypto.randomUUID(); setBusy(id); window.YiyuMobile?.chat(id, input.trim()) }}>{busy ? '小鱼在想…' : '发送给小鱼'}</button>{!window.YiyuMobile && <p>此处为 Web 预览；手机安装版才能使用本机密钥连接模型。</p>}</section>
}
