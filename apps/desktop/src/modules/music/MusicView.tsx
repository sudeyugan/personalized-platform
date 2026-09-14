import { ChevronDown, ChevronUp, Headphones, Music2, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo, useState, type ChangeEvent } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import type { PlaybackContextKind } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'

const contextLabels: Record<PlaybackContextKind, string> = {
  global: '全局背景', work: '当前作品', chapter: '当前章节', focus: '专注模式',
}

export function MusicView() {
  const { data, importTrack, updateTrack, trashTrack, restoreTrack, permanentlyDeleteTrack, setMusicContext, playTrack, setMusicSettings } = useLibraryStore()
  const [context, setContext] = useState<PlaybackContextKind>('global')
  const [message, setMessage] = useState('导入后的音频保存在一隅资料库，不依赖原文件。')
  const [deleting, setDeleting] = useState<{ id: string; title: string; permanent: boolean } | null>(null)
  const active = data.tracks.filter((track) => !track.deletedAt)
  const deleted = data.tracks.filter((track) => track.deletedAt)
  const scopeId = context === 'work' ? data.session.activeWorkId : context === 'chapter' ? data.session.activeChapterId : undefined
  const selected = useMemo(() => context === 'global' || context === 'focus'
    ? data.musicContexts[context]
    : data.musicContexts[context === 'work' ? 'works' : 'chapters'][scopeId ?? ''] ?? [], [data.musicContexts, context, scopeId])
  const ordered = useMemo(() => [...active].sort((left, right) => {
    const leftIndex = selected.indexOf(left.id); const rightIndex = selected.indexOf(right.id)
    if (leftIndex < 0 && rightIndex < 0) return 0
    if (leftIndex < 0) return 1
    if (rightIndex < 0) return -1
    return leftIndex - rightIndex
  }), [active, selected])

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]; event.target.value = ''
    for (const file of files) try { await importTrack(file); setMessage(`已导入 ${file.name}`) } catch (error) { setMessage(error instanceof Error ? error.message : '导入失败') }
  }
  const setQueue = (trackIds: string[]) => setMusicContext(context, scopeId, trackIds)
  const toggle = (trackId: string) => setQueue(selected.includes(trackId) ? selected.filter((item) => item !== trackId) : [...selected, trackId])
  const move = (trackId: string, direction: -1 | 1) => {
    const queue = [...selected]; const index = queue.indexOf(trackId); const target = index + direction
    if (index < 0 || target < 0 || target >= queue.length) return
    ;[queue[index], queue[target]] = [queue[target], queue[index]]; setQueue(queue)
  }

  return <main className="music-view scroll-view">
    <header className="page-header"><div><p className="eyebrow">氛围与陪伴</p><h1>让声音留在写作之间</h1><p>{message}</p></div><label className="primary-button music-upload"><input type="file" multiple accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/flac" onChange={(event) => void choose(event)} /><Plus size={16} />导入本地音乐</label></header>
    <section className="music-context-card"><div><Headphones /><span><strong>播放上下文</strong><small>更具体的设置优先；自动切歌默认关闭。</small></span></div><div className="context-tabs">{(['global', 'work', 'chapter', 'focus'] as const).map((item) => <button className={context === item ? 'active' : ''} onClick={() => setContext(item)} key={item}>{contextLabels[item]}</button>)}</div><label><input type="checkbox" checked={data.settings.music.autoSwitch} onChange={(event) => setMusicSettings({ autoSwitch: event.target.checked })} />进入对应作品、章节或专注模式时自动切换</label><label className="loop-setting">播完后 <select aria-label="循环方式" value={data.settings.music.loop} onChange={(event) => setMusicSettings({ loop: event.target.value as 'off' | 'all' | 'one' })}><option value="off">停止</option><option value="all">列表循环</option><option value="one">单曲循环</option></select></label><small>快捷键：Ctrl+Alt+空格播放/暂停，Ctrl+Alt+←/→切换曲目。</small></section>
    <section className="track-list">{ordered.map((track) => { const queueIndex = selected.indexOf(track.id); return <article key={track.id} className={queueIndex >= 0 ? 'track-card assigned' : 'track-card'}><button className="track-play" aria-label={`播放${track.title}`} onClick={() => playTrack(track.id, context)}><Play size={16} /></button><div className="track-fields"><input aria-label={`${track.title}标题`} defaultValue={track.title} onBlur={(event) => updateTrack(track.id, { title: event.target.value, artist: track.artist })} /><input aria-label={`${track.title}艺术家`} defaultValue={track.artist} onBlur={(event) => updateTrack(track.id, { title: track.title, artist: event.target.value })} /><small>{(track.size / 1024 / 1024).toFixed(1)} MB · {track.fileName}</small></div><label className="context-check"><input type="checkbox" checked={queueIndex >= 0} onChange={() => toggle(track.id)} /><span>用于{contextLabels[context]}</span></label>{queueIndex >= 0 && <div className="queue-order"><button aria-label={`上移${track.title}`} disabled={queueIndex === 0} onClick={() => move(track.id, -1)}><ChevronUp size={14} /></button><button aria-label={`下移${track.title}`} disabled={queueIndex === selected.length - 1} onClick={() => move(track.id, 1)}><ChevronDown size={14} /></button></div>}<button aria-label={`删除${track.title}`} onClick={() => setDeleting({ id: track.id, title: track.title, permanent: false })}><Trash2 size={15} /></button></article> })}</section>
    {!active.length && <section className="empty-state"><Music2 size={40} /><h2>曲库还是安静的</h2><p>导入 MP3、WAV、OGG、M4A 或 FLAC，单个文件不超过 200 MB。</p></section>}
    {deleted.length > 0 && <section className="record-trash"><h2>音乐回收站</h2>{deleted.map((track) => <div key={track.id}><span>{track.title}</span><button onClick={() => restoreTrack(track.id)}><RotateCcw size={13} />恢复</button><button onClick={() => setDeleting({ id: track.id, title: track.title, permanent: true })}><Trash2 size={13} />永久删除</button></div>)}</section>}
    {deleting && <ConfirmDialog title={deleting.permanent ? '永久删除音乐？' : '将音乐移入回收站？'} subject={deleting.title} description={deleting.permanent ? '音频副本和所有播放上下文引用都会清理，无法恢复。' : '音乐会停止出现在曲库和播放队列中，之后仍可恢复。'} confirmLabel={deleting.permanent ? '永久删除' : '移入回收站'} permanent={deleting.permanent} onCancel={() => setDeleting(null)} onConfirm={() => { if (deleting.permanent) void permanentlyDeleteTrack(deleting.id); else trashTrack(deleting.id); setDeleting(null) }} />}
  </main>
}
