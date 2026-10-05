export type ChatPresentation = 'bubble' | 'voice' | 'full'

export function resolveChatPresentation(requested: ChatPresentation, attention: boolean) {
  return attention ? 'full' : requested
}

export function chatDimensions(mode: ChatPresentation) {
  return mode === 'full' ? { width: 350, height: 480 } : { width: 300, height: 210 }
}

export function conversationCaption(speech: string, stream: string, messages: { role: string; content: string }[]) {
  return speech || stream || messages.findLast((message) => message.role === 'companion')?.content || '想说什么都可以。'
}
