import { useState, useSyncExternalStore } from 'react'
import {
  privateConversation,
  setPrivateConversation,
  subscribeConversationPrivacy,
} from './conversationPrivacy'
export function ConversationPrivacyToggle({ disabled = false }: { disabled?: boolean }) {
  const local = useSyncExternalStore(subscribeConversationPrivacy, privateConversation, () => true)
  const [error, setError] = useState('')
  return (
    <span>
      <button
        type="button"
        className="companion-privacy-toggle"
        aria-pressed={local}
        disabled={disabled}
        title={
          local
            ? '只留本机，与普通会话上下文分开'
            : '新增纯聊天可在已配对设备间加密接续；工具/私人查询不自动同步'
        }
        onClick={() => {
          try {
            setPrivateConversation(!local)
            setError('')
          } catch {
            setError('会话设置未保存')
          }
        }}
      >
        {local ? '仅本机会话' : '普通会话'}
      </button>
      {error && <small role="alert">{error}</small>}
    </span>
  )
}
