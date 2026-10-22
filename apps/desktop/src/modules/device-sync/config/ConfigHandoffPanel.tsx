import { useCallback, useEffect, useState } from 'react'
import { requestCode, type ConfigChannel, type ConfigHandoff, type ConfigScope } from '@yiyu/sync'
import './configHandoff.css'

export function ConfigHandoffPanel({ client }: { client?: ConfigHandoff }) {
  const [scopes, setScopes] = useState<ConfigScope[]>(['model'])
  const [follow, setFollow] = useState(true)
  const [status, setStatus] = useState<Awaited<ReturnType<ConfigHandoff['status']>>>()
  const [pending, setPending] = useState<ConfigChannel[]>([])
  const [sending, setSending] = useState<Awaited<ReturnType<ConfigHandoff['sending']>>>([])
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [entered, setEntered] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const refresh = useCallback(async () => {
    if (!client) return
    const next = await client.tick()
    setPending(next)
    setStatus(await client.status())
    setSending(await client.sending())
    setCodes(
      Object.fromEntries(
        await Promise.all(
          next.map(async (item) => [item.request.value.id, await requestCode(item.request.value)]),
        ),
      ),
    )
  }, [client])
  useEffect(() => {
    let active = true
    const poll = () => {
      if (active && !document.hidden)
        void refresh().then(() => {
          if (active) setMessage('')
        }).catch((error: unknown) => {
          if (active) setMessage(error instanceof Error ? error.message : '配置交接暂不可用；现有配置保留。请稍后重试。')
        })
    }
    poll()
    const timer = setInterval(poll, 15000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [refresh])
  const action = async (job: () => Promise<unknown>) => {
    setBusy(true)
    setMessage('')
    try {
      await job()
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '未完成交接，原配置保留。')
    } finally {
      setBusy(false)
    }
  }
  const incoming = status?.incoming
  const waiting = incoming && !incoming.stopped && !incoming.sequence
  return (
    <section className="config-handoff" aria-label="配置交接">
      <p className="config-kicker">同一份默契，各自的边界</p>
      <h3>沿用已有配置</h3>
      <p>不再逐项填写 API。由已有设备确认一次，只交接兼容的服务。</p>
      {!client ? (
        <p className="config-note">
          需要已配对的 Windows 或 Android 原生版；网页预览不会接收密钥。
        </p>
      ) : (
        <>
          {incoming && (
            <div className="config-receipt" role="status">
              <strong>
                {incoming.stopped
                  ? incoming.sequence
                    ? '配置已保留 · 当前独立使用'
                    : '已停止接收'
                  : incoming.sequence
                    ? '正在沿用 · 自动接收后续更新'
                    : incoming.request.value.expires < Date.now()
                      ? '本次请求已过期，请停止后重新申请'
                      : '等已有设备确认'}
              </strong>
              {waiting && (
                <>
                  <p>在已有设备打开同一设置，核对这组校验码：</p>
                  <code>{status?.code}</code>
                  <small>仅校验设备，不是 API Key。十分钟有效。</small>
                </>
              )}
              {!incoming.stopped && (
                <button disabled={busy} onClick={() => void action(() => client.stop())}>
                  停止跟随，保留当前配置
                </button>
              )}
            </div>
          )}
          {(!incoming || incoming.stopped) && (
            <>
              <div className="config-options">
                {(['model', 'voice'] as const).map((scope) => (
                  <label key={scope}>
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={(event) =>
                        setScopes((current) =>
                          event.target.checked
                            ? [...current, scope]
                            : current.filter((value) => value !== scope),
                        )
                      }
                    />
                    <span>{scope === 'model' ? '对话模型 · DeepSeek' : '语音 · ElevenLabs'}</span>
                  </label>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={follow}
                    onChange={(event) => setFollow(event.target.checked)}
                  />
                  <span>跟随以后更新，也可随时独立使用</span>
                </label>
              </div>
              <button
                disabled={busy || !scopes.length}
                onClick={() => void action(() => client.request(scopes, follow))}
              >
                向已有设备申请沿用
              </button>
            </>
          )}
          {pending.map((channel) => {
            const request = channel.request.value
            return (
              <div className="config-receipt" key={request.id}>
                <strong>{request.name || '另一台设备'} 想沿用配置</strong>
                <small>
                  {request.target.slice(0, 8)} ·{' '}
                  {request.scopes
                    .map((scope) => (scope === 'model' ? '对话模型' : '语音'))
                    .join('、')}{' '}
                  · {request.follow ? '含后续更新' : '仅这一次'}
                </small>
                <label>
                  输入新设备显示的校验码
                  <input
                    autoComplete="off"
                    spellCheck={false}
                    value={entered[request.id] ?? ''}
                    placeholder="例如 abcd ef01 2345"
                    maxLength={20}
                    onChange={(event) =>
                      setEntered((current) => ({ ...current, [request.id]: event.target.value }))
                    }
                  />
                </label>
                <div className="config-buttons">
                  <button
                    disabled={
                      busy ||
                      (entered[request.id] ?? '').replace(/[\s·-]/g, '').toLowerCase() !==
                        codes[request.id]?.replace(/[\s·-]/g, '')
                    }
                    onClick={() => void action(() => client.approve(channel, codes[request.id]))}
                  >
                    批准所选配置
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void action(() => client.reject(request.id))}
                  >
                    拒绝
                  </button>
                </div>
              </div>
            )
          })}
          {sending.map((item) => (
            <div className="config-receipt" key={item.request.value.id}>
              <strong>正在向 {item.request.value.name} 提供配置</strong>
              <small>
                仅{' '}
                {item.request.value.scopes
                  .map((scope) => (scope === 'model' ? '对话模型' : '语音'))
                  .join('、')}
              </small>
              <button
                disabled={busy}
                onClick={() => void action(() => client.stopSending(item.request.value.id))}
              >
                停止提供后续更新
              </button>
            </div>
          ))}
          <button disabled={busy} onClick={() => void action(refresh)}>
            刷新交接状态
          </button>
        </>
      )}
      {message && (
        <p className="config-note" role="status">
          {message}
        </p>
      )}
      <details>
        <summary>哪些会交接，哪些不会？</summary>
        <p>
          仅支持的模型、声音和所选服务 Key；中枢只中转密文，浏览器层不读取明文
          Key。停止跟随后保留当前值；在服务设置手动保存也会阻止旧交接继续覆盖。
        </p>
        <p>
          系统权限、浏览器账号、摄像头与麦克风设置不迁移。共用 Key
          会使用同一账户额度；撤销设备不能抹掉它已获得的 Key，设备丢失需到服务商轮换。
        </p>
      </details>
    </section>
  )
}
