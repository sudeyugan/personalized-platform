import { useState } from 'react'
import { moveHub } from '../repository'
export function HubMigration({ current }: { current: string }) {
  const [url, setUrl] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  return (
    <details className="hub-migration">
      <summary>中枢迁址</summary>
      <p className="footnote">
        当前 {current}
        。先把同一中枢完整备份恢复到新服务器，不能新建空中枢冒充迁移。不会清除身份、密钥或待发送修改。
      </p>
      <label>
        新 HTTPS 地址
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="https://你的中枢域名"
        />
      </label>
      <button
        disabled={busy || !url.trim()}
        onClick={() => {
          if (
            !confirm(
              '向这个新地址发送本设备连接凭证以核验原中枢历史？不会在核验前上传待发送资料；请确认地址属于你。',
            )
          )
            return
          setBusy(true)
          setMessage('正在核验，暂未切换…')
          void moveHub(url)
            .then(() => {
              setUrl('')
              setMessage('中枢地址已更新，原身份与待同步修改保留。')
            })
            .catch((error) => setMessage(error instanceof Error ? error.message : '未能迁址。'))
            .finally(() => setBusy(false))
        }}
      >
        核验并迁移地址
      </button>
      {message && (
        <p className="footnote" role="status">
          {message}
        </p>
      )}
    </details>
  )
}
