import { useState } from 'react'
import './chat.css'
import { DesktopSenseSettings } from './DesktopSenseSettings'
export function CompanionSettings() {
  const [mode, setMode] = useState(
    () => localStorage.getItem('yiyu.mobile.pet-mode-v3') ?? 'figurine',
  )
  const [scale, setScale] = useState(() =>
    Number(localStorage.getItem('yiyu.mobile.pet-scale') ?? 1),
  )
  const [motion, setMotion] = useState(
    () => localStorage.getItem('yiyu.mobile.pet-motion') !== 'false',
  )
  const [message, setMessage] = useState('')
  const configure = (next = mode, size = scale, animate = motion) => {
    if (!window.YiyuMobile?.configurePet?.(next, size, animate)) {
      setMessage('此处仅预览；请在本次安卓版配置。')
      return
    }
    setMode(next)
    setScale(size)
    setMotion(animate)
    try {
      localStorage.setItem('yiyu.mobile.pet-mode-v3', next)
      localStorage.setItem('yiyu.mobile.pet-scale', String(size))
      localStorage.setItem('yiyu.mobile.pet-motion', String(animate))
      setMessage('已记下伙伴形态；开启后生效。')
    } catch {
      setMessage('原生设置已保存，页面偏好未保存。')
    }
  }
  return (
    <section className="paper-card companion-settings">
      <div className="pet-settings-heading">
        <div>
          <p className="eyebrow">轻轻留在屏幕一角</p>
          <h2>随身小鱼</h2>
          <p className="footnote">独立于软件页面，正常比例的小鱼。</p>
        </div>
      </div>
      <div className="segments" aria-label="伙伴形态">
        {[
          ['mark', '轻墨'],
          ['figurine', '小手办'],
          ['expanded', '展开常驻'],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={mode === id} onClick={() => configure(id)}>
            {label}
          </button>
        ))}
      </div>
      <label>
        大小 · {Math.round(scale * 100)}%
        <input
          type="range"
          min="0.7"
          max="1.4"
          step="0.05"
          value={scale}
          onChange={(event) => configure(mode, Number(event.target.value))}
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={motion}
          onChange={(event) => configure(mode, scale, event.target.checked)}
        />
        动作、轻待机与眨眼
      </label>
      <div className="toolbar">
        <button
          className="primary"
          disabled={!window.YiyuMobile}
          onClick={() => {
            configure()
            window.YiyuMobile?.showPet()
          }}
        >
          显示独立小鱼
        </button>
        <button
          disabled={!window.YiyuMobile}
          onClick={() => {
            window.YiyuMobile?.hidePet()
            setMessage('小鱼已隐藏，语音也会结束。')
          }}
        >
          不显示
        </button>
      </div>
      {message && (
        <p className="footnote" role="status">
          {message}
        </p>
      )}
      <p className="footnote">
        轻点开始/结束语音，拖动提起、松手落稳，长按调整姿态或打招呼。小鱼独立悬浮，不随软件页面切换；锁屏隐藏并停止语音。桌面长按空白处也可添加一隅的小组件；组件里的图片是静态的，可活动的是独立悬浮小鱼。
      </p>
      <DesktopSenseSettings />
    </section>
  )
}
