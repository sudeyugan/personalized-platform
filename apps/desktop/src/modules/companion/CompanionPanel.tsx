import { BookmarkPlus, LockKeyhole, Send, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createCompanionProvider } from '../../infrastructure/companionProvider'
import { buildCompanionContext } from '../../state/companionSlice'
import { useLibraryStore } from '../../state/useLibraryStore'

export function CompanionPanel() {
  const { data, temporaryCompanionWorkIds, grantTemporaryCompanionWork, addCompanionMessage, clearCompanionMessages, addCompanionMemory } = useLibraryStore()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const work = data.works.find((item) => item.id === data.session.activeWorkId)
  const chapterAuthorized = data.companion.permissions.chapterIds.includes(data.session.activeChapterId)
  const context = useMemo(() => buildCompanionContext(data, temporaryCompanionWorkIds), [data, temporaryCompanionWorkIds])
  const encryptedAuthorized = Boolean(work && (data.companion.permissions.workIds.includes(work.id) || chapterAuthorized))
  const hasTemporaryGrant = Boolean(work && temporaryCompanionWorkIds.includes(work.id))
  const encryptedNeedsGrant = Boolean(work?.encrypted && !work.locked && encryptedAuthorized && !hasTemporaryGrant)
  const send = async () => {
    const message = draft.trim(); if (!message || busy) return
    setDraft(''); setBusy(true); setError('')
    addCompanionMessage({ id: `message-${crypto.randomUUID()}`, role: 'user', content: message, createdAt: new Date().toISOString(), contextSummary: context.summary })
    try { const reply = await createCompanionProvider(data.companion.provider).reply({ message, context: context.text, companionName: data.companion.name }); addCompanionMessage({ id: `message-${crypto.randomUUID()}`, role: 'companion', content: reply, createdAt: new Date().toISOString(), contextSummary: context.summary }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '伙伴暂时无法回应') }
    finally { setBusy(false) }
  }
  return <section className="companion-panel context-section">
    <header><div><span className={`companion-avatar ${data.companion.expression} hair-${data.companion.appearance.hair} outfit-${data.companion.appearance.outfit}`}>隅</span><span><strong>{data.companion.name}</strong><small>{context.summary}</small></span></div>{data.companion.messages.length > 0 && <button aria-label="清空伙伴对话" onClick={clearCompanionMessages}><Trash2 size={13} /></button>}</header>
    {encryptedNeedsGrant && <button className="temporary-grant" onClick={() => grantTemporaryCompanionWork(work!.id, true)}><LockKeyhole size={13} />仅本次解锁会话允许读取《{work!.title}》</button>}
    {hasTemporaryGrant && work?.encrypted && <button className="temporary-grant" onClick={() => grantTemporaryCompanionWork(work.id, false)}><LockKeyhole size={13} />撤销本次会话的文稿读取权限</button>}
    <div className="companion-messages">{data.companion.messages.slice(-8).map((message) => <div className={message.role} key={message.id}><small>{message.role === 'user' ? '你' : data.companion.name}</small><p>{message.content}</p>{message.role === 'companion' && <button className="remember-message" disabled={Boolean(work?.encrypted)} title={work?.encrypted ? '加密作品对话不能保存为普通长期记忆' : '保存为可治理记忆'} onClick={() => addCompanionMemory(message.content, 'conversation', '伙伴对话', work?.id)}><BookmarkPlus size={12} />记住</button>}</div>)}{!data.companion.messages.length && <div className="companion-empty"><Sparkles size={18} /><p>我不会主动读取内容。你可以在权限中心决定这次谈话带上什么。</p></div>}</div>
    {error && <p className="companion-error">{error}</p>}
    <div className="companion-compose"><textarea aria-label="给伙伴留言" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder="说点什么…" /><button aria-label="发送给伙伴" disabled={!draft.trim() || busy} onClick={() => void send()}><Send size={14} /></button></div>
  </section>
}
