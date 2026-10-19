const key = 'yiyu.companion.private-session.v1'
const eventName = 'yiyu:conversation-privacy'
export function privateConversation() {
  // Existing PC sessions retain their local context until an explicit switch.
  try {
    return localStorage.getItem(key) !== 'false'
  } catch {
    return true
  }
}
export function setPrivateConversation(value: boolean) {
  localStorage.setItem(key, String(value))
  window.dispatchEvent(new Event(eventName))
}
export function subscribeConversationPrivacy(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === key) listener()
  }
  window.addEventListener(eventName, listener)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener(eventName, listener)
    window.removeEventListener('storage', storage)
  }
}
