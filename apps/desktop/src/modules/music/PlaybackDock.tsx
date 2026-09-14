import { ListMusic, Pause, Play, SkipBack, SkipForward, Volume2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { audioRepository } from '../../infrastructure/audioRepository'
import { resolvePlaybackContext } from '../../state/musicSlice'
import { useLibraryStore } from '../../state/useLibraryStore'

const contextNames = { global: '全局', work: '作品', chapter: '章节', focus: '专注' } as const

export function PlaybackDock({ moduleEnabled = true, showEmptyHint = false }: { moduleEnabled?: boolean; showEmptyHint?: boolean }) {
  const { data, playback, playTrack, togglePlayback, nextTrack, previousTrack, setMusicSettings } = useLibraryStore()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [url, setUrl] = useState('')
  const [emptyHintVisible, setEmptyHintVisible] = useState(true)
  const track = data.tracks.find((item) => item.id === data.session.currentTrackId && !item.deletedAt)

  useEffect(() => {
    let active = true; let objectUrl = ''
    if (!track) { setUrl(''); return }
    void audioRepository.readUrl(track).then((value) => { objectUrl = value; if (active) setUrl(value) }).catch(() => setUrl(''))
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [track])
  useEffect(() => { const audio = audioRef.current; if (!audio || !url) return; audio.volume = data.settings.music.volume; if (playback.playing) void audio.play().catch(() => {}); else audio.pause() }, [url, playback.playing, data.settings.music.volume])
  useEffect(() => { if (!data.settings.music.autoSwitch) return; const [kind, queue] = resolvePlaybackContext(data); if (queue[0] && (!playback.queue.includes(queue[0]) || data.session.currentTrackId !== queue[0])) playTrack(queue[0], kind) }, [data, playback.queue, playTrack])
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      if (event.code === 'Space') { event.preventDefault(); togglePlayback() }
      if (event.code === 'ArrowRight') { event.preventDefault(); nextTrack() }
      if (event.code === 'ArrowLeft') { event.preventDefault(); previousTrack() }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [nextTrack, previousTrack, togglePlayback])

  const controlsVisible = moduleEnabled && data.settings.music.playerVisible
  const className = `playback-dock${track ? '' : ' empty'}${controlsVisible ? '' : ' hidden-controls'}`
  if (!track) return showEmptyHint && emptyHintVisible ? <div className={className}><ListMusic size={16} /><span>选择一首音乐后，声音会在页面间继续。</span><button aria-label="关闭音乐提示" title="关闭提示" onClick={() => setEmptyHintVisible(false)}><X size={15} /></button></div> : null
  return <div className={className}><audio ref={audioRef} src={url} onEnded={() => { if (data.settings.music.loop === 'one') { audioRef.current!.currentTime = 0; void audioRef.current!.play() } else if (data.settings.music.loop === 'all') nextTrack(); else togglePlayback() }} /><div className="playing-track"><span className="music-disc">♪</span><span><strong>{track.title}</strong><small>{track.artist} · {contextNames[playback.context]}</small></span></div><div className="playback-controls"><button aria-label="上一首" title="上一首（Ctrl+Alt+←）" onClick={previousTrack}><SkipBack size={15} /></button><button className="play-toggle" aria-label={playback.playing ? '暂停' : '播放'} title="播放/暂停（Ctrl+Alt+空格）" onClick={togglePlayback}>{playback.playing ? <Pause size={17} /> : <Play size={17} />}</button><button aria-label="下一首" title="下一首（Ctrl+Alt+→）" onClick={nextTrack}><SkipForward size={15} /></button></div><label className="volume-control"><Volume2 size={14} /><input aria-label="音量" type="range" min="0" max="1" step="0.05" value={data.settings.music.volume} onChange={(event) => setMusicSettings({ volume: Number(event.target.value) })} /></label></div>
}
