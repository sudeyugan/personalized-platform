import { useLyricsPreferences } from './preferences'
export function LyricsDisplaySettings() {
  const { value, set, error } = useLyricsPreferences()
  return <details className="lyrics-display-settings"><summary>歌词呈现</summary>
    <div className="setting-row"><div><strong>显示伴听歌词</strong><span>角色旁显示当前句；点击展开整曲阅读，交谈时自动让位</span></div><button aria-label="显示伴听歌词" aria-pressed={value.enabled} className={value.enabled ? 'switch on' : 'switch'} onClick={() => set({ enabled: !value.enabled })}><i /></button></div>
    <label className="setting-row"><div><strong>摆放方式</strong><span>独立摆放时拖动歌词顶部移动；偏好只保存在本机</span></div><select aria-label="歌词摆放方式" value={value.pinned ? 'pinned' : 'attached'} onChange={(event) => set({ pinned: event.target.value === 'pinned', through: false })}><option value="attached">跟随角色</option><option value="pinned">独立摆放</option></select></label>
    <label className="setting-row"><div><strong>字号 · {value.fontSize}px</strong><span>桌宠银蓝字幕，WebM暖白纸笺</span></div><input aria-label="歌词字号" type="range" min="12" max="28" step="1" value={value.fontSize} onChange={(event) => set({ fontSize: Number(event.target.value) })} /></label>
    <label className="setting-row"><div><strong>不透明度 · {value.opacity}%</strong><span>较低时融入桌面，较高时方便阅读</span></div><input aria-label="歌词不透明度" type="range" min="35" max="100" step="1" value={value.opacity} onChange={(event) => set({ opacity: Number(event.target.value) })} /></label>
    {value.pinned && <><div className="setting-row"><div><strong>鼠标穿透</strong><span>开启后不能点击或拖动歌词；回到这里关闭即可恢复</span></div><button aria-label="歌词鼠标穿透" aria-pressed={value.through} className={value.through ? 'switch on' : 'switch'} onClick={() => set({ through: !value.through })}><i /></button></div><button onClick={() => set({ position: undefined, through: false, enabled: true })}>重置歌词位置</button></>}
    {error && <p role="status">{error}</p>}
  </details>
}
