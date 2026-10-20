import { useState } from 'react'
import { conflicts, heads } from '@yiyu/sync'
import { getSnapshot, join, resolveVersion, sync } from '../repository'
import type { Action } from './HomePage'
import { CompanionSettings } from '../companion/CompanionSettings'
import { VoiceSettings } from '../companion/VoiceSettings'
import { HubMigration } from '../components/HubMigration'
import '../native'
import { ConfigHandoffPanel } from '../../../desktop/src/modules/device-sync/config/ConfigHandoffPanel'
import { mobileConfigHandoff } from '../configHandoff'
export function SettingsPage({
  snapshot,
  action,
}: {
  snapshot: ReturnType<typeof getSnapshot>
  action: Action
}) {
  const { state, lastSync } = snapshot
  const [invitation, setInvitation] = useState(''),
    [apiKey, setApiKey] = useState(''),
    [message, setMessage] = useState('')
  const [inherit, setInherit] = useState(true)
  return (
    <section className="connection">
      <p className="eyebrow">在这里安顿，也随你同行</p>
      <h1>连接与设置</h1>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <section className="paper-card">
        <h2>让一隅，随你同行</h2>
        {state ? (
          <>
            <p>已连接 · {state.config.name}</p>
            <button disabled={snapshot.busy} onClick={() => void action(sync)}>{snapshot.busy ? '正在同步…' : '现在同步'}</button>
            <HubMigration current={state.config.url} />
            <ConfigHandoffPanel client={mobileConfigHandoff(state.config)}/>
            {snapshot.configError && <p className="footnote" role="status">{snapshot.configError}</p>}
            <p className="footnote">
              {lastSync ? `最近同步 ${new Date(lastSync).toLocaleTimeString()}` : '等待同步'} ·{' '}
              {state.pending.length} 项待发送
            </p>
            {conflicts(state)
              .filter((key) =>
                [
                  'todos',
                  'assignments',
                  'courses',
                  'calendar',
                  'diary',
                  'moods',
                  'ideas',
                  'chat',
                ].includes(key.split('/')[0]),
              )
              .map((key) => (
                <details key={key}>
                  <summary>有不同修改 · {key.split('/')[0]}</summary>
                  {heads(state, key).map((version) => (
                    <div key={version.id}>
                      <pre>{JSON.stringify(version.value, null, 2) ?? '删除记录'}</pre>
                      <button
                        onClick={() => {
                          if (confirm('使用这一版本？其他分支不会自动合并，请先核对内容。'))
                            void action(() => resolveVersion(key, version.id))
                        }}
                      >
                        使用这一版
                      </button>
                    </div>
                  ))}
                </details>
              ))}
          </>
        ) : (
          <>
            <label>
              在电脑「数据管理」生成邀请，粘贴到这里
              <textarea
                value={invitation}
                onChange={(event) => setInvitation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label><input type="checkbox" checked={inherit} onChange={event => setInherit(event.target.checked)}/>连接后申请沿用对话模型配置（需已有设备批准）</label>
            <button
              className="primary"
              disabled={!invitation.trim()}
              onClick={() =>
                void action(async () => {
                  await join(invitation, '我的手机')
                  setInvitation('')
                  const connected = getSnapshot().state
                  if (inherit && connected) await mobileConfigHandoff(connected.config)?.request(['model'], true)
                })
              }
            >
              连接我的中枢
            </button>
          </>
        )}
        <p className="footnote">
          手机有自己的离线资料。邀请含密钥，请勿公开；同步不替代备份。远端使用受信任 HTTPS，无需同一
          Wi-Fi 或安装 VPN；服务器仍需单独准备。
        </p>
      </section>
      <CompanionSettings />
      <VoiceSettings />
      <section className="paper-card">
        <h2>手机的对话模型</h2>
        <label>
          DeepSeek API Key
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        <button
          disabled={!window.YiyuMobile}
          onClick={() => {
            const ok = window.YiyuMobile?.saveApiKey(apiKey.trim())
            setApiKey('')
            setMessage(ok ? '手机模型密钥已更新。' : '保存失败，原设置未确认改变。')
          }}
        >
          保存手机密钥
        </button>
        <p className="footnote">
          仅存 Android Keystore
          保护的本机密文；也可在上方申请加密交接。手动保存会改为本机配置，阻止原交接覆盖。保存空值删除手机密钥。聊天和想法工坊复用它，不自动发送其他资料。
        </p>
      </section>
      <details className="paper-card">
        <summary>手机与电脑的能力边界</summary>
        <p>
          手机保留：待办、作业、课表/日程、日记、心情记录与回望、想法工坊和小鱼对话。未选模块不在手机提供入口，PC功能与旧资料不删除。
        </p>
        <p>
          仍未迁移：本地图片／音乐附件与歌词、作品级加密库、版本备份管理、PC专用浏览器与电脑操作、摄像头／永久语音唤醒、心率设备。已有文字和引用保留，不把缺失附件伪装成已同步；跨设备执行将在后续阶段单独授权实现。
        </p>
      </details>
    </section>
  )
}
