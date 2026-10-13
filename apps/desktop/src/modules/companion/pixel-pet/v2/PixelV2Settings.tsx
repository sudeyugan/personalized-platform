import { useLibraryStore } from '../../../../state/useLibraryStore'
import { normalizePixelEnhancements } from '../../../../domain/pixelPetEnhancements'
import { CameraSettings } from './CameraSettings'
import './PixelV2Settings.css'
export function PixelV2Settings() {
  const {data,setCompanionPixelEnhancements}=useLibraryStore(),settings=normalizePixelEnhancements(data.companion.desktop.pixelEnhancements)
  return <div className="pet-v2-settings">
    <div className="pet-v2-heading"><strong>像素动画引擎</strong><small>原版保留，随时切回</small></div>
    <div className="pet-v2-engine" role="group" aria-label="像素动画引擎">
      <button type="button" aria-pressed={!settings.enabled} onClick={()=>setCompanionPixelEnhancements({enabled:false})}><strong>原像素版</strong><small>现有眼神与轻待机</small></button>
      <button type="button" aria-pressed={settings.enabled} onClick={()=>setCompanionPixelEnhancements({enabled:true})}><strong>Pixel Pet 2.0</strong><small>姿态、表情与自主行为</small></button>
    </div>
    {settings.enabled&&<>
      <label className="pet-v2-toggle"><span><strong>自主行为</strong><small>根据互动与闲置选择动作，不连续随机播放</small></span><input type="checkbox" aria-label="像素桌宠自主行为" checked={settings.autonomy} onChange={event=>setCompanionPixelEnhancements({autonomy:event.target.checked})}/></label>
      <div className="pet-v2-activity" role="group" aria-label="桌宠动作活跃程度">{(['quiet','natural','lively'] as const).map((value,index)=><button type="button" key={value} aria-pressed={settings.activity===value} onClick={()=>setCompanionPixelEnhancements({activity:value})}>{['安静','自然','活跃'][index]}</button>)}</div>
      <CameraSettings/>
      <label className="pet-v2-window"><span><strong>桌面窗口互动</strong><small>只看边界，不读标题或正文，不操作其他窗口</small></span><select aria-label="桌宠窗口互动" value={settings.windowMode} onChange={event=>setCompanionPixelEnhancements({windowMode:event.target.value as typeof settings.windowMode})}><option value="off">关闭</option><option value="observe">只观察切换</option><option value="side">侧边跟随</option><option value="top">顶部趴边</option></select></label>
      <small>跟随只移动小鱼；窗口全屏、关闭、跨DPI或没有足够空间时回到安全位置。拖动或手动摆放会暂停本次跟随，重开此选项可恢复。</small>
    </>}
  </div>
}
