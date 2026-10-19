import { useState } from 'react'
import { conflicts, heads } from '@yiyu/sync'
import { getSnapshot, join, resolveVersion } from '../repository'
import type { Action } from './HomePage'
import pet from '../../../desktop/src/modules/companion/pixel-pet/art/assets/pixel-free-v1.png'
import '../native'
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
  const [style, setStyle] = useState(() => localStorage.getItem('yiyu.mobile.pet-style') ?? 'pixel')
  const [scale, setScale] = useState(() => Number(localStorage.getItem('yiyu.mobile.pet-scale') ?? 1))
  const [motion, setMotion] = useState(() => localStorage.getItem('yiyu.mobile.pet-motion') !== 'false')
  const configure = (nextStyle = style, nextScale = scale, nextMotion = motion) => {
    setStyle(nextStyle)
    setScale(nextScale)
    setMotion(nextMotion)
    const ok = window.YiyuMobile?.configurePet?.(nextStyle, nextScale, nextMotion)
    if (ok) {
      localStorage.setItem('yiyu.mobile.pet-style', nextStyle)
      localStorage.setItem('yiyu.mobile.pet-scale', String(nextScale))
      localStorage.setItem('yiyu.mobile.pet-motion', String(nextMotion))
    } else
      setMessage(
        window.YiyuMobile
          ? '伙伴设置未写入，请重试或更新安装包。'
          : '网页仅预览；安装版会在本机保存伙伴设置。',
      )
  }
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
            <p className="footnote">
              {lastSync ? `最近同步 ${new Date(lastSync).toLocaleTimeString()}` : '等待同步'} ·{' '}
              {state.pending.length} 项待发送
            </p>
            {conflicts(state).map((key) => (
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
            <button
              className="primary"
              disabled={!invitation.trim()}
              onClick={() =>
                void action(async () => {
                  await join(invitation, '我的手机')
                  setInvitation('')
                })
              }
            >
              连接我的中枢
            </button>
          </>
        )}
        <p className="footnote">
          手机有自己的离线资料。邀请含密钥，请勿公开；同步不替代备份。云服务器中枢已规划，当前连接不会自动迁移。
        </p>
      </section>
      <section className="paper-card">
        <div className="pet-settings-heading">
          <img src={pet} alt="小鱼" />
          <div>
            <p className="eyebrow">不只是屏幕上的一张图</p>
            <h2>随身小鱼</h2>
            <p className="footnote">拖动靠近左右或底部会换姿态；长按可自由放置、休息或收起。</p>
          </div>
        </div>
        <div className="segments" aria-label="伙伴画风">
          {[
            ['pixel', '像素'],
            ['chibi', 'Q 版'],
            ['detailed', '精细'],
          ].map(([id, label]) => (
            <button key={id} aria-pressed={style === id} onClick={() => configure(id)}>
              {label}
            </button>
          ))}
        </div>
        <label>
          大小 <span>{Math.round(scale * 100)}%</span>
          <input
            type="range"
            min="0.7"
            max="1.4"
            step="0.05"
            value={scale}
            onChange={(event) => configure(style, Number(event.target.value))}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={motion}
            onChange={(event) => configure(style, scale, event.target.checked)}
          />
          轻待机与自然眨眼
        </label>
        <div className="toolbar">
          <button
            className="primary"
            disabled={!window.YiyuMobile}
            onClick={() => window.YiyuMobile?.showPet()}
          >
            开启小鱼
          </button>
          <button disabled={!window.YiyuMobile} onClick={() => window.YiyuMobile?.hidePet()}>
            收起小鱼
          </button>
        </div>
        <p className="footnote">
          悬浮权限由你开启，运行时保留系统通知。熄屏／锁屏暂停并隐藏；没有读取其他应用或跟踪摄像头。
        </p>
      </section>
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
          保护的本机密文；不从电脑同步。保存空值删除手机密钥。聊天和想法工坊复用它，不自动发送其他资料。
        </p>
      </section>
      <details className="paper-card">
        <summary>手机与电脑的能力边界</summary>
        <p>
          已适配：日记、18种心情与两种回望、待办与作业、日历课表、作品章节富文本、人物地点时间线、经历纸卡排行、想法推敲、三类本地仪式与小鱼。
        </p>
        <p>
          仍未迁移：本地图片／音乐附件与歌词、作品级加密库、版本备份管理、PC专用浏览器与电脑操作、摄像头／语音唤醒、心率设备。已有文字和引用保留，不把缺失附件伪装成已同步；跨设备执行将在后续阶段单独授权实现。
        </p>
      </details>
    </section>
  )
}
