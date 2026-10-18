import { createCompanionProvider } from '../../infrastructure/companionProvider'
import { useLibraryStore } from '../../state/useLibraryStore'
import { IDEA_LIMITS, type IdeaFrame } from '../../domain/ideas/types'
import { parseIdeaFrame } from '../../domain/ideas/validation'
import { createPrivacyProtectedProvider, type PrivacyReviewRequest } from '../privacy'
import { assertExternalAiAllowed } from '../trust/trustPolicy'
import { beijingTime } from '../companion/agent/context'
import type { AgentMessage, AgentModelProvider } from '../companion/agent/types'
import { IDEA_PROMPT } from './prompt'

export interface IdeaRequest { id: string; revision: number; signal: AbortSignal; requestReview(request: PrivacyReviewRequest): Promise<boolean> }
export async function generateIdeaRound(request: IdeaRequest, factory: typeof createCompanionProvider = createCompanionProvider): Promise<IdeaFrame> {
  const initial = useLibraryStore.getState().data
  const config = initial.companion.provider
  const originalSession = initial.ideas?.sessions.find(item => item.id === request.id)
  const signature = (data: typeof initial) => JSON.stringify([data.companion.provider, data.settings.trust, data.settings.modules.find(item => item.id === 'ideas')])
  const expected = signature(initial), controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  request.signal.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => { timedOut = true; cancel() }, 60000)
  const assertCurrent = () => {
    if (controller.signal.aborted || request.signal.aborted) throw new Error(timedOut ? '模型响应超时，原来的手稿仍保留，可以重试。' : '已暂停，本轮没有覆盖手稿。')
    const data = useLibraryStore.getState().data, session = data.ideas?.sessions.find(item => item.id === request.id && !item.deletedAt)
    if (data.session.activeView !== 'ideas' || data.ideas?.activeId !== request.id || !session || session !== originalSession || session.revision !== request.revision || !session.pending) throw new Error('手稿或页面已变化，本轮结果不再写入。')
    if (signature(data) !== expected || data.settings.modules.find(item => item.id === 'ideas')?.enabled === false) throw new Error('模型、模块或隐私设置已变化，请重新开始这一轮。')
    assertExternalAiAllowed(config.providerId, data.settings.trust, 'companion')
  }
  let rejectAbort: (() => void) | undefined
  try {
    assertCurrent()
    if (config.providerId === 'mock') throw new Error('请先在设置 → AI 伙伴中连接对话模型；想法工坊会复用同一份 API 配置。')
    const session = initial.ideas!.sessions.find(item => item.id === request.id)!
    // Keep actual newlines/quotes until the existing egress gateway has scanned
    // them. Serializing user material first can hide credential boundaries.
    const material = [
      `【最初的念头】\n${session.seed}`,
      `【当前手稿${session.draftEdited ? '：用户已修改，保留其原意' : '：仍是暂定整理'}】\n${session.draft || '尚未成稿'}`,
      ...session.turns.slice(-IDEA_LIMITS.recent).map(turn => `【用户此前的表达】\n${turn.input.slice(0, 1200)}\n【随后提出的问题】\n${turn.frame.question}\n【当时的可选方向】\n${turn.frame.options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`),
      `【本轮方式】${session.pending!.mode === 'collect' ? '阶段收束，形成可用手稿' : '继续澄清和深化，一次一个关键问题'}`,
      `【用户本轮的表达】\n${session.pending!.input}`,
    ].join('\n\n')
    const provider: AgentModelProvider = createPrivacyProtectedProvider(factory(config), { trust: initial.settings.trust, destination: config.providerId === 'deepseek' ? 'DeepSeek' : config.providerId, purpose: '想法工坊：仅本份想法与手稿', requestReview: request.requestReview, assertAllowed: assertCurrent })
    const messages: AgentMessage[] = [{ role: 'system', content: IDEA_PROMPT }, { role: 'user', content: material }]
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => { try { assertCurrent() } catch (error) { reject(error) } }
      controller.signal.addEventListener('abort', rejectAbort, { once: true })
    })
    for (let attempt = 0; attempt < 2; attempt++) {
      assertCurrent()
      const response = await Promise.race([provider.generate({ messages, tools: [], context: { page: 'ideas', companion: { name: initial.companion.name }, localTime: beijingTime(new Date()) } }, { signal: controller.signal }), aborted])
      assertCurrent()
      if (response.type !== 'text') throw new Error('模型返回了不支持的操作请求，没有执行任何工具。')
      const frame = parseIdeaFrame(response.text)
      if (frame) return frame
      messages.push({ role: 'system', content: '上次回复未通过结构检查，未写入手稿。请仅依据原有材料重新给出完整、非空、符合字段长度限制的version=1 JSON；不要新增工具或技术说明。' })
    }
    throw new Error('这次整理的格式不完整，原手稿未改变；可以重试这一轮。')
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', cancel)
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort)
  }
}
