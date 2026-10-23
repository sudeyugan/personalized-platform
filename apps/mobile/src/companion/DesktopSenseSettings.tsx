import { useEffect, useState } from 'react'

interface SenseStatus { requested: boolean; enabled: boolean; connected: boolean; desktop: boolean; surfaces: number }
function readStatus(): SenseStatus | null {
  try {
    const value = JSON.parse(window.YiyuMobile?.desktopSenseStatus?.() ?? 'null') as SenseStatus | null
    if (!value || ['requested', 'enabled', 'connected', 'desktop'].some(key => typeof value[key as keyof SenseStatus] !== 'boolean') || !Number.isInteger(value.surfaces) || value.surfaces < 0 || value.surfaces > 24) return null
    return value
  } catch { return null }
}
export function DesktopSenseSettings() {
  const [status, setStatus] = useState(readStatus)
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setStatus(readStatus()) }
    const timer = window.setInterval(refresh, 1500)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  const active = status?.requested && status.enabled
  return (
    <div className="desktop-sense-settings">
      <h3>坐在桌面组件上 <small>可选授权</small></h3>
      <p className="footnote">拖近组件上沿时会出现落座提示，松手后坐下。离开桌面或组件消失就解除停靠；未授权、不支持识别时，仍可长按「坐在这里」手动放置。</p>
      <p className="footnote" role="status">
        {!status ? '请在新版安卓版中开启。' : !status.requested ? '尚未开启 · 不感知桌面' : !status.enabled ? '等待你在系统设置开启「一隅 · 桌面停靠」' : !status.connected ? '系统已授权，服务待连接' : status.desktop ? `已连接 · 当前可识别 ${status.surfaces} 个组件外框` : '已连接 · 回到桌面并显示独立小鱼后感知'}
      </p>
      <div className="toolbar">
        <button disabled={!window.YiyuMobile?.setDesktopSense} onClick={() => window.YiyuMobile?.setDesktopSense?.(true)}>{active ? '查看系统授权' : '开启桌面停靠'}</button>
        {status?.requested && <button onClick={() => { window.YiyuMobile?.setDesktopSense?.(false); setStatus(readStatus()) }}>关闭感知</button>}
      </div>
      <p className="footnote">无障碍权限本身可访问窗口内容，权限较强。实现仅处理默认桌面的组件类型和外框位置，不采集文字、通知、截图，不点击其他应用；布局只留在内存，不保存、不交给模型。系统授权需你亲自完成，也可随时在系统中撤销。</p>
    </div>
  )
}
