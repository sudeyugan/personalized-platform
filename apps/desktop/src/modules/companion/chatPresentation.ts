export type ChatPresentation = 'bubble' | 'voice' | 'full'
export type ChatCharacter = 'pet' | 'webm'

export function resolveChatPresentation(requested: ChatPresentation, attention: boolean) {
  return attention ? 'full' : requested
}

export function chatDimensions(mode: ChatPresentation, character: ChatCharacter = 'pet') {
  if (mode === 'full') return { width: character === 'pet' ? 350 : 380, height: 480 }
  if (mode === 'voice') return { width: character === 'pet' ? 280 : 320, height: 160 }
  return { width: character === 'pet' ? 300 : 330, height: 210 }
}

export function conversationCaption(speech: string, stream: string, messages: { role: string; content: string }[]) {
  return speech || stream || messages.findLast((message) => message.role === 'companion')?.content || '想说什么都可以。'
}

/** Lightweight text only; full history retains the original rich content. */
export function compactText(text: string, limit = 180) {
  const plain = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/gm, '').replace(/[*_\x60]/g, '').replace(/\s+/g, ' ').trim()
  const chars = Array.from(plain)
  return { text: chars.length > limit ? chars.slice(0, limit - 1).join('') + '…' : plain, truncated: chars.length > limit }
}
