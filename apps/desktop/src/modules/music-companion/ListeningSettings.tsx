import { Headphones, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { useListeningStore } from './listeningStore'
import { lyricExcerptAt } from './lyrics'
import { LyricSheet } from './LyricSheet'
import { LyricsSettings } from './LyricsSettings'
import { LyricsDisplaySettings } from './lyrics-window/LyricsDisplaySettings'
import './listening.css'

export function ListeningSettings() {
  const { preferences, song, lines, lyricStatus, message, lyricOffsetMs, controlling, setPreferences, control } = useListeningStore()
  const name = useLibraryStore(store => store.data.companion.name)
  const supported = '__TAURI_INTERNALS__' in window
  return <section className="settings-section listening-settings"><div className="settings-title"><Headphones /><div><h2>{name}伴听</h2><p>音乐留给QQ音乐，让伙伴陪你听。不录音、不读账号、不保存收听记录。</p></div></div>
    <div className="setting-row"><div><strong>跟随QQ音乐</strong><span>{supported ? 'Windows系统媒体会话 · 仅本机读取' : '浏览器预览不支持系统歌曲读取'}</span></div><button aria-label="启用QQ音乐伴听" disabled={!supported} aria-pressed={preferences.enabled} className={preferences.enabled ? 'switch on' : 'switch'} onClick={() => setPreferences({ enabled: !preferences.enabled })}><i /></button></div>
    {preferences.enabled && <>
      <div className="listening-current">{song?.cover ? <img src={song.cover} alt="当前专辑封面" /> : <i>♫</i>}<div><small>QQ MUSIC · {song?.playing ? '正在播放' : song ? '已暂停' : '等待播放'}</small><strong>{song?.title || '开始播放一首歌'}</strong><span>{song ? song.artist + (song.album ? ' · ' + song.album : '') : '只读取QQ音乐，不会跟随浏览器或其他播放器'}</span></div></div>
      {song && <><progress aria-label="歌曲播放进度" max={song.durationMs || 1} value={song.positionMs} />{lines.length
        ? <LyricSheet excerpt={lyricExcerptAt(lines, song.positionMs + lyricOffsetMs)} paused={!song.playing} />
        : <p className="listening-lyric">{lyricStatus || '歌词未收进来，也可以先静静听。'}</p>}</>}
      <div className="setting-row"><div><strong>允许手动播放控制</strong><span>明确点击才播放、暂停或切歌；不提供播放器未支持的拖动进度</span></div><button aria-label="允许QQ音乐播放控制" aria-pressed={preferences.controls} className={preferences.controls ? 'switch on' : 'switch'} onClick={() => setPreferences({ controls: !preferences.controls })}><i /></button></div>
      {preferences.controls && song && <div className="listening-buttons"><button disabled={controlling || !song.canPrevious} aria-label="QQ音乐上一首" onClick={() => void control('previous')}><SkipBack size={16} /></button><button disabled={controlling || !(song.playing ? song.canPause : song.canPlay)} aria-label={song.playing ? '暂停QQ音乐' : '播放QQ音乐'} onClick={() => void control(song.playing ? 'pause' : 'play')}>{song.playing ? <Pause size={17} /> : <Play size={17} />}</button><button disabled={controlling || !song.canNext} aria-label="QQ音乐下一首" onClick={() => void control('next')}><SkipForward size={16} /></button></div>}
      <p className="listening-source-state">{preferences.onlineLyrics ? (preferences.qqLyrics ? '查找来源：QQ音乐优先 · LRCLIB兜底' : '查找来源：仅LRCLIB · 可在下方开启QQ歌词') : '仅用本地歌词 · 在线收集未开启'}<span>已存歌词优先复用</span></p>
      <LyricsSettings />
      <LyricsDisplaySettings />
      {message && <p role="status">{message}</p>}
    </>}
  </section>
}
