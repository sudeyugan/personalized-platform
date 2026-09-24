export type VoiceConversationPhase = 'sleeping' | 'listening' | 'committing' | 'thinking' | 'speaking' | 'interrupted'

export type VoiceCommand = 'end' | 'hide'

export function normalizeVoiceText(value: string) {
  return value.toLocaleLowerCase().replace(/[，。！？,.!?；;：:\s]/g, '')
}

export function resolveVoiceCommand(value: string): VoiceCommand | undefined {
  const normalized = normalizeVoiceText(value)
  if (/^(?:小鱼)?(?:藏起来|隐藏起来|休息吧|退下吧)$/.test(normalized)) return 'hide'
  if (/^(?:小鱼)?(?:先这样|结束对话|不聊了)$/.test(normalized)) return 'end'
  return undefined
}

function bigrams(value: string) {
  if (value.length < 2) return value ? [value] : []
  return Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2))
}

export function isLikelyPlaybackEcho(transcript: string, spokenText: string) {
  const heard = normalizeVoiceText(transcript)
  const spoken = normalizeVoiceText(spokenText)
  if (heard.length < 2 || spoken.length < 4) return false
  if (heard.length >= 4 && (spoken.includes(heard) || heard.includes(spoken))) return true
  const heardPairs = bigrams(heard)
  const spokenPairs = new Set(bigrams(spoken))
  const overlap = heardPairs.filter((pair) => spokenPairs.has(pair)).length
  return overlap / Math.max(1, heardPairs.length) >= 0.72
}

export function hasBargeInSignal(partial: string) {
  return normalizeVoiceText(partial).length >= 2
}

export function isDuplicateUtterance(previous: { text: string; at: number } | undefined, text: string, now = Date.now()) {
  return Boolean(previous && now - previous.at < 2_000 && normalizeVoiceText(previous.text) === normalizeVoiceText(text))
}
