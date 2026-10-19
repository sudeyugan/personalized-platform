import { useEffect, useRef, useState } from 'react'
import { requestModel } from './model'
interface Message {
  role: 'user' | 'companion'
  content: string
  id: string
}
const historyKey = 'yiyu.mobile.chat.v1',
  rememberKey = 'yiyu.mobile.chat-remember'
function loadHistory(): Message[] {
  try {
    if (localStorage.getItem(rememberKey) !== 'true') return []
    const data: unknown = JSON.parse(localStorage.getItem(historyKey) ?? '[]')
    if (!Array.isArray(data)) return []
    return data
      .filter((item): item is Message =>
        Boolean(
          item &&
            typeof item === 'object' &&
            ['user', 'companion'].includes(item.role) &&
            typeof item.content === 'string' &&
            item.content.length <= 12000 &&
            typeof item.id === 'string',
        ),
      )
      .slice(-80)
  } catch {
    return []
  }
}
export function Chat() {
  const [input, setInput] = useState(''),
    [messages, setMessages] = useState(loadHistory),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [remember, setRemember] = useState(() => localStorage.getItem(rememberKey) === 'true')
  const controller = useRef<AbortController | null>(null),
    locked = useRef(false),
    end = useRef<HTMLDivElement>(null)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key !== historyKey && event.key !== rememberKey) return
      const enabled = localStorage.getItem(rememberKey) === 'true'
      setRemember(enabled)
      const next = loadHistory()
      setMessages(current => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  }, [messages.length, busy])
  useEffect(() => {
    try {
      if (remember && localStorage.getItem(rememberKey) === 'true') localStorage.setItem(historyKey, JSON.stringify(messages.slice(-80)))
      else localStorage.removeItem(historyKey)
    } catch {
      setError('对话没有成功保存在本机，请暂勿关闭。')
    }
  }, [messages, remember])
  const send = async () => {
    if (locked.current || !input.trim()) return
    const content = input.trim(),
      abort = new AbortController()
    controller.current = abort
    locked.current = true
    setBusy(true)
    setError('')
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content }])
    setInput('')
    try {
      // No automatic private-record attachment or hidden history submission.
      const reply = await requestModel(content, 'chat', abort.signal)
      if (!abort.signal.aborted)
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'companion', content: reply }])
    } catch (cause) {
      if (!abort.signal.aborted) {
        setError(cause instanceof Error ? cause.message : '暂未接通。')
        setInput(content)
      }
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return (
    <section className="phone-chat">
      <p className="eyebrow">在这一隅，陪着你</p>
      <h1>小鱼在这里。</h1>
      <div className="toolbar">
        <label className="check-label">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => {
              const next = event.target.checked
              try {
                localStorage.setItem(rememberKey, String(next))
                if (!next) localStorage.removeItem(historyKey)
                setRemember(next)
              } catch {
                setError('对话保存设置未能更新。')
              }
            }}
          />
          仅在本机保留对话
        </label>
        <button
          disabled={busy || !messages.length}
          className="text-button"
          onClick={() => {
            if (confirm('清空手机里的这些对话？不会影响电脑或中枢。')) setMessages([])
          }}
        >
          清空
        </button>
      </div>
      <p className="footnote">
        仅发送你本次输入的文字给
        DeepSeek；历史用于回看，不自动附带。不读取同步资料或其他应用，没有电脑控制权限。
      </p>
      <div className="chat-thread" aria-live="polite">
        {messages.map((message) => (
          <article className={`chat-message ${message.role === 'user' ? 'user' : ''}`} key={message.id}>
            {message.content}
          </article>
        ))}
        {busy && (
          <div className="chat-message" role="status">
            小鱼在想…{' '}
            <button
              className="text-button"
              onClick={() => {
                controller.current?.abort()
                setBusy(false)
              }}
            >
              停止等待
            </button>
          </div>
        )}
        <div ref={end} />
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <form
        className="chat-compose"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <textarea
          aria-label="给小鱼的话"
          maxLength={3000}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="说点什么…"
        />
        <div className="toolbar">
          <small>{input.length} / 3000</small>
          <button className="primary" disabled={!window.YiyuMobile || busy || !input.trim()} type="submit">
            发送给小鱼
          </button>
        </div>
      </form>
      {!window.YiyuMobile && <p className="footnote">此处为 Web 预览；安装版使用手机本机密钥连接模型。</p>}
    </section>
  )
}
