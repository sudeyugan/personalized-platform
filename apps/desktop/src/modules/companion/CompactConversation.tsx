import { CircleStop, Maximize2, MessageCircle, X } from 'lucide-react'
import { emitTo } from '@tauri-apps/api/event'
import type { ChatPresentation } from './chatPresentation'
import './compactConversation.css'

export function CompactConversation({ mode, name, caption, status, busy, speaking, note, onExpand, onStop, character = 'webm', style = 'chibi', truncated = false, onReading }: {
  mode: ChatPresentation; name: string; caption: string; status: string; busy: boolean; speaking: boolean
  note?: string
  onExpand: () => void; onStop: () => void
  character?: 'pet' | 'webm'; style?: string; truncated?: boolean; onReading?: (reading: boolean) => void
}) {
  return <section className={`compact-conversation ${mode}`} data-character={character} data-pet-style={style} aria-label="伙伴轻量对话"
    onPointerEnter={() => onReading?.(true)} onPointerLeave={() => onReading?.(false)}
    onFocusCapture={() => onReading?.(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onReading?.(false) }}>
    <header><span><i className={busy || speaking ? 'active' : ''} /><strong>{name}</strong><small>{status}</small></span>
      <button title="展开完整聊天" aria-label="展开完整聊天" onClick={onExpand}><Maximize2 size={14} /></button>
    </header>
    <p className="compact-caption" aria-live="polite">{caption}</p>
    {note && <small className="compact-conversation-note" title={note}>{note}</small>}
    <footer>
      <button onClick={onExpand}><MessageCircle size={13} />{truncated ? '展开全文 / 回复' : mode === 'voice' ? '打字 / 查看全文' : '回复 / 查看全文'}</button>
      <span>{(busy || speaking) && <button aria-label="打断回答" title="打断回答" onClick={onStop}><CircleStop size={14} /></button>}
        <button aria-label={mode === 'voice' ? '结束语音对话' : '收起对白'} title={mode === 'voice' ? '结束语音对话' : '收起对白'} onClick={() => {
          if (mode === 'voice') {
            const end = new Event('yiyu:voice-end', { cancelable: true })
            if (window.dispatchEvent(end)) void emitTo('main', 'companion:chat-toggle')
          }
          else void emitTo('main', 'companion:chat-toggle')
        }}><X size={14} /></button></span>
    </footer>
  </section>
}
