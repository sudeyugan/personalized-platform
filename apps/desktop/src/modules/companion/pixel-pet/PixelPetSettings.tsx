import { useState } from 'react'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { PixelPetRenderer } from './PixelPetRenderer'

export function PixelPetSettings() {
  const { data, setCompanionPixelPet } = useLibraryStore()
  const [previewOpen, setPreviewOpen] = useState(false)
  const enabled = data.companion.desktop.pixelPetEnabled ?? false
  return <div>
    <div className="setting-row companion-shortcut-row">
      <div><strong>像素桌宠 · 实验原型</strong><span>右侧扒边、鼠标视线追踪；不修改已有立绘和 WebM 素材</span></div>
      <label className="shortcut-picker"><span>渲染模式</span><select aria-label="伙伴渲染模式" value={enabled ? 'pixel-pet' : 'webm'} onChange={(event) => setCompanionPixelPet(event.target.value === 'pixel-pet')}>
        <option value="webm">WebM Mode / 原角色</option><option value="pixel-pet">Pixel Pet Mode</option>
      </select></label>
    </div>
    {enabled && <details open={previewOpen} onToggle={(event) => setPreviewOpen(event.currentTarget.open)}><summary>查看像素造型</summary>{previewOpen && <div className="pixel-pet-preview"><PixelPetRenderer scale={1} /></div>}<small>此处预览追踪页面内鼠标；桌面版追踪屏幕鼠标。只实现右侧扒边。</small></details>}
  </div>
}
export function PixelPetDebugPage() {
  return <main className="pixel-pet-debug-page"><section><h1>Pixel Pet · 第一阶段</h1><p>192 × 240 逻辑像素，代码实时绘制。移动鼠标观察蓝色眼睛；右侧双手固定，头部和长发轻微错拍。</p><p>此浏览器预览只追踪页面内鼠标。真实屏幕坐标由 Tauri 桌面窗口读取。</p></section><PixelPetRenderer /></main>
}
