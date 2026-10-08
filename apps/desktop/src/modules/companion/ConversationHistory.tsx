import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CompanionMessage } from '../../domain/models'
import { CompanionRichText } from './CompanionRichText'

/** Follow new replies only while the reader is already at the bottom. */
export function ConversationHistory({ messages, stream, note, children }: {
  messages: CompanionMessage[]; stream: string; note: string; children?: ReactNode
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [unread, setUnread] = useState(false)
  const latestId = messages.at(-1)?.id, latestText = messages.at(-1)?.content
  const jump = () => {
    const node = viewport.current
    if (node) node.scrollTop = node.scrollHeight
    following.current = true; setUnread(false)
  }
  useEffect(() => {
    const node = viewport.current
    if (!node) return
    if (following.current) node.scrollTop = node.scrollHeight
    else setUnread(true)
  }, [latestId, latestText, stream, note])
  return <div className="desktop-chat-history">
    <div ref={viewport} className="desktop-chat-messages" onScroll={() => {
      const node = viewport.current
      if (!node) return
      following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 40
      if (following.current) setUnread(false)
    }}>
      {children}
      {messages.map(message => <div className={`desktop-chat-message ${message.role}`} key={message.id}><CompanionRichText text={message.content} /></div>)}
      {stream && <div className="desktop-chat-message companion streaming"><CompanionRichText text={`${stream}▋`} /></div>}
      {!messages.length && !stream && !children && <p className="empty">想说什么都可以。</p>}
      {note && <small className="desktop-speech-note" role="status">{note}</small>}
    </div>
    {unread && <button className="desktop-chat-latest" onClick={jump}>回到最新回复 ↓</button>}
  </div>
}
