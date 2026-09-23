import { Download, History, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { CompanionPortraitSection } from './CompanionPortraitSection'

export function CompanionGrowthSection() {
  const { data, setCompanionDesktop, setCompanionDesktopMode, setCompanionShortcut, setCompanionQuietShortcut, addCompanionMemory, updateCompanionMemory, deleteCompanionMemory, setCompanionGrowthEnabled, setCompanionPersonality, rollbackCompanionGrowth, resetCompanionPersonality } = useLibraryStore()
  const companion = data.companion
  const [memoryDraft, setMemoryDraft] = useState('')
  const [shortcutStatus, setShortcutStatus] = useState(() => window.localStorage.getItem('yiyu:companion-shortcut-status') ?? '快捷键在一隅运行期间全局生效。')
  const [quietShortcutStatus, setQuietShortcutStatus] = useState(() => window.localStorage.getItem('yiyu:companion-quiet-shortcut-status') ?? '按一次进入安静穿透，再按一次恢复。')
  useEffect(() => {
    const updateVisibility = (event: Event) => setShortcutStatus((event as CustomEvent<string>).detail)
    const updateQuiet = (event: Event) => setQuietShortcutStatus((event as CustomEvent<string>).detail)
    window.addEventListener('yiyu:companion-shortcut-status', updateVisibility)
    window.addEventListener('yiyu:companion-quiet-shortcut-status', updateQuiet)
    return () => {
      window.removeEventListener('yiyu:companion-shortcut-status', updateVisibility)
      window.removeEventListener('yiyu:companion-quiet-shortcut-status', updateQuiet)
    }
  }, [])

  const exportMemories = () => { const blob = new Blob([JSON.stringify(companion.memories, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = '一隅-伙伴记忆.json'; link.click(); URL.revokeObjectURL(url) }

  return <section className="settings-section companion-growth-section">
    <div className="settings-title"><Sparkles /><div><h2>伙伴形象与成长</h2><p>桌面形态、长期记忆和性格变化都可以关闭、查看或撤销。</p></div></div>
    <div className="settings-subsection"><div className="settings-subsection-heading"><strong>伙伴立绘与桌面显示</strong><small>第一阶段使用单张透明立绘，未来可替换为 Live2D Renderer</small></div>
      <div className="setting-row"><div><strong>桌面伙伴</strong><span>透明置顶窗口，可拖动和单独隐藏</span></div><button aria-pressed={companion.desktop.visible} className={companion.desktop.visible ? 'switch on' : 'switch'} onClick={() => setCompanionDesktop(!companion.desktop.visible)}><i /></button></div>
      <div className="setting-row companion-shortcut-row"><div><strong>桌面显示方式</strong><span>{companion.desktop.mode === 'quiet' ? '半透明置顶，不挡住下方点击；可用快捷键或语音恢复互动' : companion.desktop.mode === 'normal' ? '允许其他窗口盖住伙伴，点击和拖动保持可用' : '始终置顶，可直接点击、拖动和打开对话'}</span></div><label className="shortcut-picker companion-mode-picker"><span>模式</span><select aria-label="桌面伙伴显示方式" value={companion.desktop.mode} onChange={(event) => setCompanionDesktopMode(event.target.value as typeof companion.desktop.mode)}><option value="interactive">互动</option><option value="quiet">安静穿透</option><option value="normal">普通窗口</option></select></label></div>
      <div className="setting-row companion-shortcut-row"><div><strong>显示 / 隐藏快捷键</strong><span>{shortcutStatus}</span></div><label className="shortcut-picker"><span>按键组合</span><select aria-label="显示或隐藏伙伴的快捷键" value={companion.desktop.toggleShortcut} onChange={(event) => setCompanionShortcut(event.target.value)}><option value="">关闭快捷键</option><option value="CommandOrControl+Alt+Y">Ctrl + Alt + Y</option><option value="CommandOrControl+Alt+J">Ctrl + Alt + J</option><option value="CommandOrControl+Alt+B">Ctrl + Alt + B</option><option value="CommandOrControl+Shift+Y">Ctrl + Shift + Y</option></select></label></div>
      <div className="setting-row companion-shortcut-row"><div><strong>安静穿透快捷键</strong><span>{quietShortcutStatus}</span></div><label className="shortcut-picker"><span>按键组合</span><select aria-label="切换安静穿透模式的快捷键" value={companion.desktop.quietShortcut} onChange={(event) => setCompanionQuietShortcut(event.target.value)}><option value="">关闭快捷键</option><option value="CommandOrControl+Alt+T">Ctrl + Alt + T</option><option value="CommandOrControl+Alt+Q">Ctrl + Alt + Q</option><option value="CommandOrControl+Alt+P">Ctrl + Alt + P</option><option value="CommandOrControl+Shift+T">Ctrl + Shift + T</option></select></label></div>
      <CompanionPortraitSection />
    </div>
    <div className="settings-subsection"><div className="settings-subsection-heading"><strong>可治理记忆</strong><small>只有启用的记忆才会注入对话；删除立即生效</small></div>
      <div className="memory-compose"><input aria-label="新增伙伴记忆" value={memoryDraft} onChange={(event) => setMemoryDraft(event.target.value)} placeholder="例如：我更喜欢安静的提醒" /><button className="ghost-button" onClick={() => { if (addCompanionMemory(memoryDraft, 'manual', '用户手动添加')) setMemoryDraft('') }}>添加</button><button className="ghost-button" disabled={!companion.memories.length} onClick={exportMemories}><Download size={13} />导出</button></div>
      <div className="memory-list">{companion.memories.map((memory) => <div key={memory.id}><input aria-label={`记忆内容 ${memory.sourceLabel}`} value={memory.content} onChange={(event) => updateCompanionMemory(memory.id, { content: event.target.value })} /><small>{memory.sourceLabel} · {new Date(memory.createdAt).toLocaleDateString()} · 置信度 {memory.confidence}%</small><button aria-label="切换记忆授权" aria-pressed={memory.authorized} className={memory.authorized ? 'switch on' : 'switch'} onClick={() => updateCompanionMemory(memory.id, { authorized: !memory.authorized })}><i /></button><button aria-label="删除伙伴记忆" onClick={() => deleteCompanionMemory(memory.id)}><Trash2 size={14} /></button></div>)}{!companion.memories.length && <p>还没有长期记忆。对话不会自动成为记忆。</p>}</div>
    </div>
    <div className="settings-subsection"><div className="settings-subsection-heading"><strong>性格权重与变化日志</strong><small>自然成长默认关闭，开启后仅根据明确互动轻微变化</small></div>
      <div className="setting-row"><div><strong>允许自然成长</strong><span>不会扩大资料或音乐权限</span></div><button aria-pressed={companion.growth.enabled} className={companion.growth.enabled ? 'switch on' : 'switch'} onClick={() => setCompanionGrowthEnabled(!companion.growth.enabled)}><i /></button></div>
      <div className="personality-grid">{([['warmth', '温暖'], ['curiosity', '好奇'], ['initiative', '主动']] as const).map(([key, label]) => <label key={key}><span>{label}<b>{companion.personality[key]}</b></span><input type="range" min="0" max="100" value={companion.personality[key]} onChange={(event) => setCompanionPersonality({ [key]: Number(event.target.value) }, `手动调整${label}`)} /></label>)}</div>
      <div className="growth-actions"><button className="ghost-button" onClick={resetCompanionPersonality}><RotateCcw size={13} />重置性格</button></div>
      <details className="growth-log"><summary><History size={13} />变化日志（{companion.growth.logs.length}）</summary>{companion.growth.logs.slice().reverse().map((log) => <div key={log.id}><span><strong>{log.reason}</strong><small>{new Date(log.createdAt).toLocaleString()}</small></span><button onClick={() => rollbackCompanionGrowth(log.id)}>回退到此前</button></div>)}</details>
    </div>
  </section>
}
