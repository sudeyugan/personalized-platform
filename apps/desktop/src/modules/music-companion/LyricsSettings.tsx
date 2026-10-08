import { useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { CatalogSearch } from '../catalog-search/CatalogSearch'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useListeningStore } from './listeningStore'
import { lyricCache } from './lyricCache'
import { trackKey } from './types'

export function LyricsSettings() {
  const { preferences, song, lines, lyricStatus, lyricOffsetMs, setPreferences, importLyrics, setLyricOffset, forgetLyrics, retryLyrics } = useListeningStore()
  const count = useLibraryStore(store => store.data.lyricLibrary?.entries.filter(item => item.lrc).length ?? 0)
  const saveStatus = useLibraryStore(store => store.saveStatus)
  const [error, setError] = useState(''), [confirm, setConfirm] = useState<string>()
  return <details className="listening-lyrics-settings"><summary>个人歌词库 · {count} 首</summary>
    <p>歌词与逐曲校准保存本地，重启、再次播放和离线时复用，随资料备份。优先使用你导入的LRC，不记录播放次数、不自动朗读或发送歌词给AI。</p>
    <div className="setting-row"><div><strong>自动收集当前歌曲的同步歌词</strong><span>默认关闭。向LRCLIB发送标题、歌手、专辑与时长；稳定播放后查找，不读取QQ账号或收藏列表。</span></div><button type="button" aria-label="自动收集同步歌词" aria-pressed={preferences.onlineLyrics} className={preferences.onlineLyrics ? 'switch on' : 'switch'} onClick={() => setPreferences({ onlineLyrics: !preferences.onlineLyrics })}><i /></button></div>
    <div className="setting-row"><div><strong>优先使用QQ音乐歌词</strong><span>单独默认关闭。启用自动收集后，向 u.y.qq.com 发送当前歌名与歌手，再向 c.y.qq.com 发送匹配歌曲的标识取得LRC；专辑和时长用于核对。无需密钥、账号或Cookie，未找到时尝试LRCLIB。开启此项也会启用自动收集，歌曲暂停时也可查找。</span></div><button type="button" aria-label="优先使用QQ音乐歌词" aria-pressed={preferences.qqLyrics === true} className={preferences.qqLyrics ? 'switch on' : 'switch'} onClick={() => setPreferences({ qqLyrics: !preferences.qqLyrics, ...(!preferences.qqLyrics ? { onlineLyrics: true } : {}) })}><i /></button></div>
    {preferences.qqLyrics && <p>公开来源可能调整，不保证每首都有歌词；不同现场、伴奏或混音不会自动混用。已存歌词优先复用，关闭联网仍可显示。</p>}
    <label className="background-upload">为当前歌曲导入LRC<input type="file" accept=".lrc,text/plain" disabled={!song} onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; const key = trackKey(song)
      if (!file) return
      try { if (file.size > 200_000) throw new Error('请选择200KB以内的LRC'); importLyrics(await file.text(), key); setError('') }
      catch (value) { setError(value instanceof Error ? value.message : '歌词未能读取') }
    }} /></label>
    <label className="listening-offset">此曲歌词校准（秒）<input type="number" min="-10" max="10" step="0.1" disabled={!song || !lines.length} value={lyricOffsetMs / 1000} onChange={event => setLyricOffset(Number(event.target.value) * 1000)} /></label>
    {lyricStatus && <p role="status">{lyricStatus}</p>}{error && <p role="alert">{error}</p>}
    {saveStatus === 'error' && <p role="alert">资料尚未成功保存，歌词可能只在本次会话内可用；请检查存储状态，勿直接退出。</p>}
    <button type="button" disabled={!song || !preferences.enabled || !preferences.onlineLyrics || lyricCache.get(trackKey(song))?.source === 'manual' || lyricStatus.startsWith('正在匹配') || lyricStatus === '等待重新查找…'} onClick={retryLyrics}>重新查找此曲歌词</button>
    <button type="button" disabled={!song} onClick={() => setConfirm(trackKey(song))}>移除此曲歌词</button>
    {confirm && <ConfirmDialog title="移除此曲保存的歌词？" subject={song?.title || '当前歌曲'} description="歌词及校准会移除，本曲自动查找暂停6小时；不会改变QQ音乐或其他歌曲。" confirmLabel="移除歌词" onCancel={() => setConfirm(undefined)} onConfirm={() => { if (confirm === trackKey(useListeningStore.getState().song)) forgetLyrics(); setConfirm(undefined) }} />}
    <CatalogSearch query={song ? `${song.title} ${song.artist} ${song.album} LRC 歌词`.slice(0, 200) : ''} />
  </details>
}
