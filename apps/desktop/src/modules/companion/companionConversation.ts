import type { CompanionMessage, CompanionVideoState } from '../../domain/models'
import { createCompanionProvider } from '../../infrastructure/companionProvider'
import { useLibraryStore } from '../../state/useLibraryStore'
import { applyContextPrivacy, applyHistoryPrivacy, assertExternalAiAllowed } from '../trust/trustPolicy'
import { createPrivacyProtectedProvider, type PrivacyReviewRequest } from '../privacy'
import { AgentPermissionEngine, buildAgentAccess, buildAgentContext, createCompanionToolRegistry, runAgent } from './agent'
import type { AgentPermissionRequest, AgentRuntimeStatus } from './agent/types'
import { resolveDirectAction } from './agent/directActions'
import { localRitualTools } from './agent/ritualTools'
import { resolveBrowserTask } from '../browser-connection/taskGoal'
import { prepareOperationTurn, finishOperationTurn, offerOperationTraining } from '../operation-memory/turn'
import type { OperationSelection } from '../../domain/operations/types'
import { prepareBrowserTurn, rememberBrowserTurn, forgetBrowserTurn } from '../browser-connection/taskSession'
import { createLiveCompanionApplicationServices } from './liveApplicationServices'
export { createLiveCompanionApplicationServices } from './liveApplicationServices'

export interface CompanionTurnOptions {
  conversationChannel?:'main'|'desktop'
  onStatus?: (status?: AgentRuntimeStatus) => void
  onTextDelta?: (delta: string) => void
  onTextReset?: () => void
  /** Display only; never added to the persisted library or model history. */
  onTransientMessage?: (message: CompanionMessage) => void
  onVisualState?: (state: CompanionVideoState) => void
  requestPermission?: (request: AgentPermissionRequest) => Promise<boolean>
  requestPrivacyReview?: (request: PrivacyReviewRequest) => Promise<boolean>
  inputMode?: 'text' | 'voice'
  voiceReplyLength?: 'short' | 'standard'
  signal?: AbortSignal
  operation?: OperationSelection
  onOperationReceipt?: (status: 'awaiting_review' | 'handoff' | 'error', toolCount: number) => void
}

export async function sendCompanionTurn(message: string, options: CompanionTurnOptions = {}) {
  const operation = options.operation ? prepareOperationTurn(options.operation) : undefined
  const userText = operation?.message ?? message.trim()
  if (!userText) throw new Error('请输入想说的话')
  const store = useLibraryStore.getState()
  const { data, temporaryCompanionWorkIds } = store
  const channel=options.conversationChannel??'main'
  const prepared=operation?undefined:prepareBrowserTurn(userText,data.companion,channel)
  const clean=prepared?.message??userText
  const taskText = operation?.goal ?? clean
  const privateBrowserQuery = Boolean(resolveBrowserTask(taskText, data.companion)) || operation?.scope === 'browser'
  const displayTransient = (role: CompanionMessage['role'], content: string) => {
    if (options.signal?.aborted) return
    const item: CompanionMessage = { id: `transient-${crypto.randomUUID()}`, role, content, createdAt: new Date().toISOString(), localOnly: true }
    options.onTransientMessage?.(item)
  }
  if (operation || privateBrowserQuery || !data.settings.trust.retainConversationHistory) displayTransient('user', userText)
  const access = buildAgentAccess(data, temporaryCompanionWorkIds)
  const registry = createCompanionToolRegistry(options.onVisualState)
  const localAction = resolveDirectAction(taskText, registry.definitions(), data.companion.name)
  if (!localAction || !localRitualTools.has(localAction.name)) assertExternalAiAllowed(data.companion.provider.providerId, data.settings.trust, 'companion')
  const fullContext = applyContextPrivacy(buildAgentContext(data, access), data.settings.trust)
  const context = operation || privateBrowserQuery ? { page: operation ? 'operation-memory' : 'browser-query', companion: fullContext.companion, localTime: fullContext.localTime } : fullContext
  const services = createLiveCompanionApplicationServices(data, access, options.requestPrivacyReview, options.signal, taskText)
  const assertBrowserAllowed = privateBrowserQuery && data.companion.browser?.enabled ? services.assertBrowserAuthority : undefined
  const authorizeBrowserSend = assertBrowserAllowed && services.browserTaskGoal?.origins.length && !data.companion.browser?.confirmQueryEgress ? services.authorizeBrowserQueryEgress : undefined
  const permissions = new AgentPermissionEngine(() => {
    const live = useLibraryStore.getState()
    return {
      policy: { autoAllow: ['read', 'presentation'] },
      resourcePermissions: live.data.companion.permissions,
      computer: live.data.companion.computer,
      access: buildAgentAccess(live.data, live.temporaryCompanionWorkIds),
      modules: live.data.settings.modules,
    }
  })
  const contextSummary = [context.activeWork?.title, context.activeChapter?.title].filter(Boolean).join('、') || '未授权作品或章节'
  const history = operation || privateBrowserQuery ? [] : applyHistoryPrivacy(data.companion.messages.filter((item) => !item.localOnly).slice(-8).map((item) => ({
    role: item.role === 'companion' ? 'assistant' as const : 'user' as const,
    content: item.content,
  })), data.settings.trust)
  let thinkingTimer: ReturnType<typeof setTimeout> | undefined
  let streamingResponse = false
  let operationToolCount = 0
  const forwardStatus = (status?: AgentRuntimeStatus) => {
    globalThis.clearTimeout(thinkingTimer)
    thinkingTimer = undefined
    if (!status) {
      options.onStatus?.(undefined)
      return
    }
    if (status.phase === 'thinking') {
      streamingResponse = false
      thinkingTimer = globalThis.setTimeout(() => options.onStatus?.(status), 400)
      return
    }
    options.onStatus?.(status)
  }
  if (!operation && !privateBrowserQuery && data.settings.trust.retainConversationHistory) store.addCompanionMessage({ id: `message-${crypto.randomUUID()}`, role: 'user', content: clean, createdAt: new Date().toISOString(), contextSummary, localOnly: Boolean(localAction && localRitualTools.has(localAction.name)) })
  try {
    const result = await runAgent({
      message: clean,
      history,
      context,
      provider: createPrivacyProtectedProvider(createCompanionProvider(data.companion.provider), {
        trust: { ...data.settings.trust, outboundProtection: data.settings.trust.outboundProtection || Boolean(data.companion.browser?.enabled) },
        destination: data.companion.provider.providerId === 'deepseek' ? 'DeepSeek' : data.companion.provider.providerId,
        purpose: 'AI 伙伴对话',
        requestReview: options.requestPrivacyReview,
        assertAllowed: assertBrowserAllowed,
        authorizeSanitizedQuery: authorizeBrowserSend,
        reviewEachRequest: Boolean(assertBrowserAllowed),
      }),
      registry,
      permissions,
      services,
      onStatus: forwardStatus,
      onTextDelta: (delta) => {
        if (!streamingResponse) {
          streamingResponse = true
          forwardStatus({ phase: 'responding' })
        }
        options.onTextDelta?.(delta)
      },
      onTextReset: () => {
        streamingResponse = false
        options.onTextReset?.()
      },
      onAudit: (entry) => {
        useLibraryStore.getState().addCompanionAudit([entry])
        if (operation && entry.toolName !== 'app.capabilities') { operationToolCount += 1; options.onOperationReceipt?.(entry.resultStatus === 'error' ? 'error' : 'awaiting_review', operationToolCount) }
      },
      requestPermission: options.requestPermission,
      responseMode: options.inputMode ?? 'text',
      voiceReplyLength: options.voiceReplyLength,
      signal: options.signal,
      assertAllowed: assertBrowserAllowed,
      operation,
    })
    if (operation) finishOperationTurn(result, options.onOperationReceipt)
    else offerOperationTraining(clean, result)
    if(data.companion.operationLearning?.enabled!==false&&prepared?.resolvedFromClarification&&prepared.task?.origins.length===1&&result.audit.some(item=>item.toolName==='browser.verify'&&item.resultStatus==='success')){
      const role=prepared.task.objective==='mail'?'mail':prepared.task.objective==='page'&&/(?:通知|公告|门户)/u.test(clean)?'portal':undefined
      if(role)useLibraryStore.getState().setCompanionBrowser({preferredSites:{...useLibraryStore.getState().data.companion.browser?.preferredSites,[role]:prepared.task.origins[0]}})
    }
    if(!operation&&!options.signal?.aborted)rememberBrowserTurn(prepared?.task,useLibraryStore.getState().data.companion,channel,clean)
    const transientReply = operation || privateBrowserQuery || result.audit.some(entry => entry.toolName.startsWith('browser.') && entry.toolName !== 'browser.status') || !data.settings.trust.retainConversationHistory
    if (transientReply) displayTransient('companion', result.text)
    else useLibraryStore.getState().addCompanionMessage({ id: `message-${crypto.randomUUID()}`, role: 'companion', content: result.text, createdAt: new Date().toISOString(), contextSummary, localOnly: result.audit.some((entry) => localRitualTools.has(entry.toolName)) })
    return result.text
  } finally {
    if(options.signal?.aborted)forgetBrowserTurn(channel)
    globalThis.clearTimeout(thinkingTimer)
    options.onStatus?.(undefined)
  }
}
