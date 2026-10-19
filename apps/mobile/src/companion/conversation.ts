import type { Records } from '@yiyu/sync'
import { changeRecords, getSnapshot } from '../repository'
import { requestModel } from '../model'
import { PrivacySession } from '../../../desktop/src/modules/privacy/privacySession'
export interface Message extends Record<string, unknown> {
  id: string
  role: 'user' | 'companion'
  content: string
  createdAt: string
}
const localKey = 'yiyu.mobile.private-chat.v2',
  modeKey = 'yiyu.mobile.private-mode.v2'
function loadPrivate(): Message[] {
  try {
    let stored = localStorage.getItem(localKey)
    if (!stored && localStorage.getItem('yiyu.mobile.chat-remember') === 'true') {
      // Old optional history stays local; never promote it to shared records.
      const legacy: unknown = JSON.parse(localStorage.getItem('yiyu.mobile.chat.v1') ?? '[]')
      if (Array.isArray(legacy))
        stored = JSON.stringify(
          legacy.map((item) => ({
            ...item,
            createdAt: item.createdAt ?? '1970-01-01T00:00:00Z',
          })),
        )
    }
    const value: unknown = JSON.parse(stored ?? '[]')
    return Array.isArray(value) ? value.filter(validMessage).slice(-100) : []
  } catch {
    return []
  }
}
function validMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false
  const item = value as Message
  return (
    typeof item.id === 'string' &&
    ['user', 'companion'].includes(item.role) &&
    typeof item.content === 'string' &&
    item.content.length <= 12000 &&
    typeof item.createdAt === 'string' &&
    Number.isFinite(Date.parse(item.createdAt))
  )
}
function privateMode() {
  try {
    return localStorage.getItem(modeKey) === 'true'
  } catch {
    return true
  }
}
let snapshot = {
  private: privateMode(),
  local: loadPrivate(),
  busy: false,
  error: '',
}
let controller: AbortController | undefined
const listeners = new Set<() => void>()
function emit(change: Partial<typeof snapshot>) {
  snapshot = { ...snapshot, ...change }
  listeners.forEach((listener) => listener())
}
export const conversationSnapshot = () => snapshot
export const subscribeConversation = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function conversationMessages(records: Records, local = snapshot.private): Message[] {
  if (local) return snapshot.local
  return Object.entries(records)
    .filter(([key, value]) => key.startsWith('chat/') && value.scope === 'shared')
    .map(([, value]) => value)
    .filter(validMessage)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}
export function setConversationPrivate(value: boolean) {
  if (snapshot.busy) return
  localStorage.setItem(modeKey, String(value))
  emit({ private: value, error: '' })
}
async function append(messages: Message[], local: boolean) {
  if (local) {
    const next = [...snapshot.local, ...messages].slice(-100)
    localStorage.setItem(localKey, JSON.stringify(next))
    emit({ local: next })
  } else
    await changeRecords((current) => ({
      ...current,
      ...Object.fromEntries(
        messages.map((message) => [`chat/${message.id}`, { ...message, scope: 'shared' }]),
      ),
    }))
}
export function stopConversation() {
  cancelConversation()
  window.YiyuMobile?.stopVoice?.()
}
export function cancelConversation() { controller?.abort() }
export async function sendConversation(input: string, voice = false): Promise<string> {
  const content = input.trim()
  if (snapshot.busy) throw new Error('上一轮还在进行，请先结束它。')
  if (!content || content.length > 3000) throw new Error('请说短一点，这轮最多3000字。')
  const abort = new AbortController(),
    local = snapshot.private
  controller = abort
  emit({ busy: true, error: '' })
  try {
    if (!local) new PrivacySession([]).sanitize(content)
    const history = conversationMessages(getSnapshot().records, local).slice(-8)
    // Keep bounded *whole* messages, never mix private and shared lanes.
    while (history.reduce((size, message) => size + message.content.length, content.length) > 15000)
      history.shift()
    const user: Message = {
      id: `message-${crypto.randomUUID()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }
    await append([user], local)
    if (abort.signal.aborted) throw new Error('本轮已结束。')
    const material = [...history, user].map((message) => ({
      role: message.role === 'companion' ? 'assistant' : 'user',
      content: message.content,
    }))
    if (voice)
      material[material.length - 1].content += '\n（这是语音会话，请自然简短回答，不超过500字。）'
    while (material.length > 1 && JSON.stringify(material).length > 18000) material.shift()
    const reply = await requestModel(JSON.stringify(material), 'conversation', abort.signal)
    if (abort.signal.aborted) throw new Error('本轮已结束。')
    if (reply.length > 12000) throw new Error('回复过长，没有写入会话。请缩小问题后再试。')
    if (!local) new PrivacySession([]).sanitize(reply)
    await append(
      [
        {
          id: `message-${crypto.randomUUID()}`,
          role: 'companion',
          content: reply,
          createdAt: new Date(Math.max(Date.now(), Date.parse(user.createdAt) + 1)).toISOString(),
        },
      ],
      local,
    )
    return reply
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : '这轮没有接通。'
    emit({ error })
    throw new Error(error)
  } finally {
    if (controller === abort) {
      controller = undefined
      emit({ busy: false })
    }
  }
}
export async function clearConversation() {
  if (snapshot.busy) return
  if (snapshot.private) {
    localStorage.setItem(localKey, '[]')
    localStorage.removeItem('yiyu.mobile.chat.v1')
    localStorage.removeItem('yiyu.mobile.chat-remember')
    emit({ local: [] })
    return
  }
  await changeRecords((current) =>
    Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith('chat/'))),
  )
}
