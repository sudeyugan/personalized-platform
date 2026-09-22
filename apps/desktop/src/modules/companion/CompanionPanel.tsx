import { BookmarkPlus, CircleStop, LockKeyhole, Send, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { buildAgentAccess, buildAgentContext, type AgentRuntimeStatus } from './agent'
import { sendCompanionTurn } from './companionConversation'
import { CompanionRichText } from './CompanionRichText'
import type { AgentPermissionRequest } from './agent/types'
import { AgentPermissionCard } from './AgentPermissionCard'
import type { CompanionMessage } from '../../domain/models'
import type { PrivacyReviewRequest } from '../privacy'
import { PrivacyReviewCard } from './PrivacyReviewCard'

const phaseLabel = (status: AgentRuntimeStatus | undefined) => {
  if (!status) return ''
  if (status.phase === 'thinking') return '正在思考…'
  if (status.phase === 'using_tool') return `正在查询：${status.toolName}`
  if (status.phase === 'waiting_permission') return `等待允许：${status.toolName}`
  if (status.phase === 'responding') return '正在整理回答…'
  return status.message
}

export function CompanionPanel() {
  const { data, temporaryCompanionWorkIds, grantTemporaryCompanionWork, clearCompanionMessages, addCompanionMemory } = useLibraryStore()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [agentStatus, setAgentStatus] = useState<AgentRuntimeStatus>()
  const [streamedReply, setStreamedReply] = useState('')
  const [transientMessages, setTransientMessages] = useState<CompanionMessage[]>([])
  const [permissionRequest, setPermissionRequest] = useState<{ request: AgentPermissionRequest; resolve: (allowed: boolean) => void }>()
  const [privacyReview, setPrivacyReview] = useState<{ request: PrivacyReviewRequest; resolve: (allowed: boolean) => void }>()
  const activeTurn = useRef<{ id: string; controller: AbortController } | undefined>(undefined)
  const work = data.works.find((item) => item.id === data.session.activeWorkId)
  const chapterAuthorized = data.companion.permissions.chapterIds.includes(data.session.activeChapterId)
  const access = useMemo(() => buildAgentAccess(data, temporaryCompanionWorkIds), [data, temporaryCompanionWorkIds])
  const context = useMemo(() => buildAgentContext(data, access), [data, access])
  const encryptedAuthorized = Boolean(work && (data.companion.permissions.workIds.includes(work.id) || chapterAuthorized))
  const hasTemporaryGrant = Boolean(work && temporaryCompanionWorkIds.includes(work.id))
  const encryptedNeedsGrant = Boolean(work?.encrypted && !work.locked && encryptedAuthorized && !hasTemporaryGrant)
  const stopTurn = () => {
    activeTurn.current?.controller.abort()
    activeTurn.current = undefined
    permissionRequest?.resolve(false)
    privacyReview?.resolve(false)
    setPermissionRequest(undefined)
    setPrivacyReview(undefined)
    setBusy(false)
    setAgentStatus(undefined)
    setStreamedReply('')
  }
  const send = async () => {
    const message = draft.trim(); if (!message || busy) return
    const turn = { id: crypto.randomUUID(), controller: new AbortController() }
    activeTurn.current = turn
    setDraft(''); setBusy(true); setError(''); setStreamedReply('')
    if (!data.settings.trust.retainConversationHistory) setTransientMessages((messages) => [...messages, { id: `transient-${crypto.randomUUID()}`, role: 'user', content: message, createdAt: new Date().toISOString() }])
    try {
      const response = await sendCompanionTurn(message, {
        signal: turn.controller.signal,
        onStatus: (status) => { if (activeTurn.current?.id === turn.id) setAgentStatus(status) },
        onTextDelta: (delta) => { if (activeTurn.current?.id === turn.id) setStreamedReply((value) => value + delta) },
        requestPermission: (request) => new Promise((resolve) => setPermissionRequest({ request, resolve })),
        requestPrivacyReview: (request) => new Promise((resolve) => setPrivacyReview({ request, resolve })),
      })
      if (!data.settings.trust.retainConversationHistory) setTransientMessages((messages) => [...messages, { id: `transient-${crypto.randomUUID()}`, role: 'companion', content: response, createdAt: new Date().toISOString() }])
    }
    catch (reason) {
      if (!turn.controller.signal.aborted && activeTurn.current?.id === turn.id) setError(reason instanceof Error ? reason.message : '伙伴暂时无法回应')
    }
    finally {
      if (activeTurn.current?.id === turn.id) {
        activeTurn.current = undefined
        setBusy(false)
        setAgentStatus(undefined)
        setStreamedReply('')
      }
    }
  }
  return <section className="companion-panel context-section">
    <header><div><span className={`companion-avatar ${data.companion.expression} hair-${data.companion.appearance.hair} outfit-${data.companion.appearance.outfit}`}>隅</span><span><strong>{data.companion.name}</strong><small>{context.activeChapter?.title ?? context.activeWork?.title ?? '未授权任何创作上下文'}</small></span></div>{data.companion.messages.length + transientMessages.length > 0 && <button aria-label="清空伙伴对话" onClick={() => { clearCompanionMessages(); setTransientMessages([]) }}><Trash2 size={13} /></button>}</header>
    {encryptedNeedsGrant && <button className="temporary-grant" onClick={() => grantTemporaryCompanionWork(work!.id, true)}><LockKeyhole size={13} />仅本次解锁会话允许读取《{work!.title}》</button>}
    {hasTemporaryGrant && work?.encrypted && <button className="temporary-grant" onClick={() => grantTemporaryCompanionWork(work.id, false)}><LockKeyhole size={13} />撤销本次会话的文稿读取权限</button>}
    <div className="companion-messages">{[...data.companion.messages.slice(-8), ...transientMessages].map((message) => <div className={message.role} key={message.id}><small>{message.role === 'user' ? '你' : data.companion.name}</small><CompanionRichText text={message.content} />{message.role === 'companion' && <button className="remember-message" disabled={Boolean(work?.encrypted)} title={work?.encrypted ? '加密作品对话不能保存为普通长期记忆' : '保存为可治理记忆'} onClick={() => addCompanionMemory(message.content, 'conversation', '伙伴对话', work?.id)}><BookmarkPlus size={12} />记住</button>}</div>)}{streamedReply && <div className="companion streaming"><small>{data.companion.name}</small><CompanionRichText text={`${streamedReply}▋`} /></div>}{!data.companion.messages.length && !transientMessages.length && !streamedReply && <div className="companion-empty"><Sparkles size={18} /><p>我不会主动读取内容。你可以在权限中心决定这次谈话带上什么。</p></div>}</div>
    {permissionRequest && <AgentPermissionCard request={permissionRequest.request} onDecision={(allowed) => { permissionRequest.resolve(allowed); setPermissionRequest(undefined) }} />}
    {privacyReview && <PrivacyReviewCard request={privacyReview.request} onDecision={(allowed) => { privacyReview.resolve(allowed); setPrivacyReview(undefined) }} />}
    {agentStatus && <p className="companion-agent-status">{phaseLabel(agentStatus)}</p>}
    {error && <p className="companion-error">{error}</p>}
    <div className="companion-compose"><textarea aria-label="给伙伴留言" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!busy) void send() } }} placeholder={busy ? '可以先写下下一句话，或中止当前回答' : '说点什么…'} />{busy ? <button className="companion-stop" aria-label="中止当前回答" title="中止当前回答" onClick={stopTurn}><CircleStop size={15} /></button> : <button aria-label="发送给伙伴" disabled={!draft.trim()} onClick={() => void send()}><Send size={14} /></button>}</div>
  </section>
}
