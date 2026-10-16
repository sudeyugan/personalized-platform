import { useEffect, useState } from 'react'
import { useLibraryStore } from '../../../../state/useLibraryStore'
import { normalizePixelEnhancements } from '../../../../domain/pixelPetEnhancements'
import { PET_VERSION_REBIND, PET_VERSION_STATUS } from '../petShortcutKeys'
import { CameraSettings } from './CameraSettings'
import './PixelV2Settings.css'
export function PixelV2Settings() {
  const {data,setCompanionPixelEnhancements}=useLibraryStore(),settings=normalizePixelEnhancements(data.companion.desktop.pixelEnhancements)
  const [shortcutStatus,setShortcutStatus]=useState(()=>localStorage.getItem(PET_VERSION_STATUS)??'Windows桌面版可使用快捷键')
  useEffect(()=>{
    const update=()=>setShortcutStatus(localStorage.getItem(PET_VERSION_STATUS)??'Windows桌面版可使用快捷键')
    window.addEventListener(PET_VERSION_STATUS,update)
    return ()=>window.removeEventListener(PET_VERSION_STATUS,update)
  },[])
  return <div className="pet-v2-settings">
    <div className="pet-v2-heading"><div><strong>桌宠版本</strong><small>两种陪伴方式，随时切换</small></div><kbd>Ctrl + Alt + A</kbd></div>
    <div className="pet-v2-engine" role="group" aria-label="桌宠版本">
      <button type="button" aria-pressed={!settings.enabled} onClick={()=>setCompanionPixelEnhancements({enabled:false})}><span className="pet-v2-edition">01 · CLASSIC</span><strong>原版</strong><small>鼠标眼神 · 轻待机<br/>不使用摄像头追踪</small><span className="pet-v2-selected">{!settings.enabled?'正在使用':'切换到原版'}</span></button>
      <button type="button" aria-pressed={settings.enabled} onClick={()=>setCompanionPixelEnhancements({enabled:true})}><span className="pet-v2-edition">02 · TRACKING</span><strong>2.0 追踪版</strong><small>摄像头跟随 · 不跟随鼠标<br/>仅本地感知，不保存画面</small><span className="pet-v2-selected">{settings.enabled?'正在使用':'切换到 2.0'}</span></button>
    </div>
    <div className="pet-v2-shortcut"><small role="status">{shortcutStatus}</small>{shortcutStatus.includes('未能绑定')&&<button type="button" className="ghost-button" onClick={()=>window.dispatchEvent(new Event(PET_VERSION_REBIND))}>重试快捷键</button>}</div>
    {settings.enabled&&<>
      <CameraSettings/>
      <details className="pet-v2-advanced"><summary>动作与窗口选项</summary><div className="pet-v2-advanced-content">
      <label className="pet-v2-toggle"><span><strong>自主行为</strong><small>根据互动与闲置选择动作，不连续随机播放</small></span><input type="checkbox" aria-label="像素桌宠自主行为" checked={settings.autonomy} onChange={event=>setCompanionPixelEnhancements({autonomy:event.target.checked})}/></label>
      <div className="pet-v2-activity" role="group" aria-label="桌宠动作活跃程度">{(['quiet','natural','lively'] as const).map((value,index)=><button type="button" key={value} aria-pressed={settings.activity===value} onClick={()=>setCompanionPixelEnhancements({activity:value})}>{['安静','自然','活跃'][index]}</button>)}</div>
      <label className="pet-v2-window"><span><strong>桌面窗口互动</strong><small>只看边界，不读标题或正文，不操作其他窗口</small></span><select aria-label="桌宠窗口互动" value={settings.windowMode} onChange={event=>setCompanionPixelEnhancements({windowMode:event.target.value as typeof settings.windowMode})}><option value="off">关闭</option><option value="observe">只观察切换</option><option value="side">侧边跟随</option><option value="top">顶部趴边</option></select></label>
      <small>跟随只移动小鱼；窗口全屏、关闭、跨DPI或没有足够空间时回到安全位置。拖动或手动摆放会暂停本次跟随，重开此选项可恢复。</small>
      </div></details>
    </>}
  </div>
}
