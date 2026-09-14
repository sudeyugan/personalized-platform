import { Maximize2, Minus, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'

function inDesktop() { return '__TAURI_INTERNALS__' in window }

async function runWindowAction(action: 'minimize' | 'toggleMaximize' | 'close') {
  if (!inDesktop()) return
  await getCurrentWindow()[action]()
}

export function WindowTitleBar() {
  return (
    <header className="window-titlebar">
      <div className="window-title" data-tauri-drag-region onDoubleClick={() => void runWindowAction('toggleMaximize')}><span data-tauri-drag-region>隅</span><strong data-tauri-drag-region>一隅</strong></div>
      <div className="window-controls">
        <button aria-label="最小化" title="最小化" onClick={() => void runWindowAction('minimize')}><Minus size={15} /></button>
        <button aria-label="最大化或还原" title="最大化或还原" onClick={() => void runWindowAction('toggleMaximize')}><Maximize2 size={13} /></button>
        <button className="window-close" aria-label="关闭" title="关闭" onClick={() => void runWindowAction('close')}><X size={16} /></button>
      </div>
    </header>
  )
}
