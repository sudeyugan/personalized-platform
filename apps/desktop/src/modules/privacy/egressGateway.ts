import type { LibraryData } from '../../domain/models'
import type { AgentModelProvider, AgentModelRequest, AgentModelResponse } from '../companion/agent/types'
import { PrivacySession } from './privacySession'
import type { PrivacyFinding, PrivacyReviewRequest } from './types'

interface EgressGatewayOptions {
  trust: LibraryData['settings']['trust']
  destination: string
  purpose: string
  requestReview?: (request: PrivacyReviewRequest) => Promise<boolean>
}

function mapStrings(value: unknown, transform: (text: string) => string): unknown {
  if (typeof value === 'string') return transform(value)
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, transform))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, transform)]))
  return value
}

function restoreResponse(response: AgentModelResponse, session: PrivacySession): AgentModelResponse {
  if (response.type === 'text') return { ...response, text: session.restore(response.text) }
  return { ...response, call: { ...response.call, arguments: mapStrings(response.call.arguments, (text) => session.restore(text)) } }
}

export function createPrivacyProtectedProvider(provider: AgentModelProvider, options: EgressGatewayOptions): AgentModelProvider {
  if (provider.id === 'mock') return provider
  const session = new PrivacySession(options.trust.privateDictionary)
  let reviewed = false
  return {
    id: provider.id,
    testConnection: () => provider.testConnection(),
    async generate(request, generationOptions) {
      const findings: PrivacyFinding[] = []
      const sanitize = (text: string) => {
        const result = session.sanitize(text)
        findings.push(...result.findings)
        return result.text
      }
      const protectedRequest = mapStrings(request, sanitize) as AgentModelRequest
      const needsReview = !reviewed && Boolean(options.requestReview) && (options.trust.outboundReviewMode === 'strict' || findings.length > 0)
      if (needsReview) {
        const findingCounts = findings.reduce<PrivacyReviewRequest['findingCounts']>((counts, finding) => ({ ...counts, [finding.kind]: (counts[finding.kind] ?? 0) + 1 }), {})
        const previewSource = protectedRequest.messages.at(-1)?.content ?? ''
        const allowed = await options.requestReview!({ destination: options.destination, purpose: options.purpose, findingCounts, sanitizedPreview: previewSource.slice(0, 800) })
        if (!allowed) throw new Error('已取消发送，内容没有离开本机。')
        reviewed = true
      }
      let rawStream = ''; let emitted = ''
      const response = await provider.generate(protectedRequest, {
        ...generationOptions,
        onTextDelta: generationOptions?.onTextDelta ? (delta) => {
          rawStream += delta
          const open = rawStream.lastIndexOf('['); const close = rawStream.lastIndexOf(']')
          const stableRaw = open > close ? rawStream.slice(0, open) : rawStream
          const restored = session.restore(stableRaw)
          if (restored.length > emitted.length) generationOptions.onTextDelta?.(restored.slice(emitted.length))
          emitted = restored
        } : undefined,
      })
      if (generationOptions?.onTextDelta) {
        const restored = session.restore(rawStream)
        if (restored.length > emitted.length) generationOptions.onTextDelta(restored.slice(emitted.length))
      }
      return restoreResponse(response, session)
    },
  }
}
