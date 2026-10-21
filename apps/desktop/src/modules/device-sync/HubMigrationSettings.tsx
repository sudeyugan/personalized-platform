import { useState } from 'react'
import { moveDeviceHub } from './runtime'
export function HubMigrationSettings({
  current,
  disabled,
}: {
  current: string
  disabled: boolean
}) {
  const [url, setUrl] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  return (
    <details>
      <summary>迁移或更换云端地址</summary>
      <p>
        当前：{current}
        。先完整备份并恢复同一中枢，不能新建空库。核验成功只改变地址，保留设备身份、密钥和待发送修改。
      </p>
      <label>
        新服务 HTTPS 地址
        <input
          type="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://你的一隅服务地址"
        />
      </label>
      <button
        disabled={disabled || busy || !url.trim()}
        onClick={() => {
          if (
            !confirm(
              '向这个地址发送本设备凭证以只读核验原中枢？请确认它属于你。核验前不会发送资料或清空待发送修改。',
            )
          )
            return
          setBusy(true)
          setMessage('正在核验…')
          void moveDeviceHub(url)
            .then(() => {
              setUrl('')
              setMessage('地址已更新，原身份与待发送修改保留。')
            })
            .catch((error) => setMessage(error instanceof Error ? error.message : '迁址未完成。'))
            .finally(() => setBusy(false))
        }}
      >
        核验并迁移
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  )
}
