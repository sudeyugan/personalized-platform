import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getSnapshot, subscribe } from './repository'
import {
  clearConversation,
  conversationMessages,
  conversationSnapshot,
  sendConversation,
  setConversationPrivate,
  stopConversation,
  subscribeConversation,
} from './companion/conversation'
import { VoiceControl } from './companion/voice'
import { useVoice, voiceActive } from './companion/voiceState'
import './companion/chat.css'
export function Chat() {
  const library = useSyncExternalStore(subscribe, getSnapshot)
  const conversation = useSyncExternalStore(subscribeConversation, conversationSnapshot)
  const voice = useVoice()
  const [input, setInput] = useState(''),
    [error, setError] = useState(''),
    [writing, setWriting] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const messages = conversationMessages(library.records)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [messages.length, conversation.busy])
  const send = async () => {
    const value = input.trim()
    if (!value || conversation.busy || voiceActive(voice.phase)) return
    setError('')
    setInput('')
    try {
      await sendConversation(value)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '没有接通。')
      setInput(value)
    }
  }
  return (
    <section className="phone-chat companion-room">
      <div className="companion-room-heading">
        <div>
          <p className="eyebrow">一段对话，也是一处归处</p>
          <h1>小鱼在这里。</h1>
        </div>
        <button
          className="text-button"
          disabled={conversation.busy || voiceActive(voice.phase)}
          onClick={() => {
            try {
              setConversationPrivate(!conversation.private)
            } catch {
              setError('会话设置未保存。')
            }
          }}
        >
          {conversation.private ? '仅本机' : '普通会话'}
        </button>
      </div>
      <VoiceControl />
      <p className="footnote conversation-scope">
        {conversation.private
          ? '这段对话仅保存在手机，与普通会话分开。'
          : '普通聊天在配对设备间加密接续；只发送本会话最近几轮文字，不自动附带资料。'}
      </p>
      <div className="chat-thread" aria-live="polite">
        {messages.slice(-80).map((message) => (
          <article
            className={'chat-message ' + (message.role === 'user' ? 'user' : '')}
            key={message.id}
          >
            {message.content}
          </article>
        ))}
        {conversation.busy && (
          <div className="chat-message" role="status">
            <span className="ink-wait" aria-label="小鱼正在思考" />
            <button className="text-button" onClick={stopConversation}>
              结束这一轮
            </button>
          </div>
        )}
        <div ref={end} />
      </div>
      {(error || conversation.error) && (
        <p className="notice" role="alert">
          {error || conversation.error}
        </p>
      )}
      <div className="toolbar">
        <button
          className="text-button"
          aria-expanded={writing}
          onClick={() => setWriting(!writing)}
        >
          {writing ? '收起文字' : '也可以写下来'}
        </button>
        <button
          className="text-button"
          disabled={conversation.busy || voiceActive(voice.phase) || !messages.length}
          onClick={() => {
            if (
              confirm(
                conversation.private
                  ? '清空手机的这段私密会话？'
                  : '清空普通会话？删除也会同步到已配对设备。',
              )
            )
              void clearConversation().catch(() => setError('未能清空，请重试。'))
          }}
        >
          清空会话
        </button>
      </div>
      {writing && (
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
            placeholder="写一笔，也听你说…"
          />
          <div className="toolbar">
            <small>{input.length} / 3000</small>
            <button
              className="primary"
              disabled={
                !window.YiyuMobile || conversation.busy || voiceActive(voice.phase) || !input.trim()
              }
              type="submit"
            >
              发送给小鱼
            </button>
          </div>
        </form>
      )}
      {!window.YiyuMobile && (
        <p className="footnote">网页仅预览；语音与模型密钥在安卓版本机配置。</p>
      )}
    </section>
  )
}
