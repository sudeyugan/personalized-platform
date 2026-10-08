import { isLikelyPlaybackEcho } from './voiceConversation'

// STT may commit an earlier sentence after the player has advanced. Retain a
// small, short-lived text-only history, not microphone audio.
export function createPlaybackEchoHistory() {
  let phrases: string[] = []
  let active = false
  let lastUpdate = 0
  return {
    update: (state: { active: boolean; text?: string }, now = Date.now()) => {
      if (state.active && !active && now - lastUpdate > 3000) phrases = []
      if (state.text && phrases.at(-1) !== state.text) phrases = [...phrases.slice(-3), state.text.slice(0, 600)]
      active = state.active
      lastUpdate = now
    },
    matches: (text: string, now = Date.now()) => (active || now - lastUpdate < 3000) && phrases.some((phrase) => isLikelyPlaybackEcho(text, phrase)),
  }
}
