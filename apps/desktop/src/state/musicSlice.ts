import type { LibraryData, PlaybackContextKind } from '../domain/models'
import { audioRepository } from '../infrastructure/audioRepository'
import { libraryRepository } from '../infrastructure/libraryRepository'
import type { LibraryStore } from './libraryStoreTypes'

type SetStore = (partial: Partial<LibraryStore>) => void
const commit = (data: LibraryData, set: SetStore) => { set({ data }); void libraryRepository.save(data) }

export function resolvePlaybackContext(data: LibraryData, focusMode = data.session.focusMode) {
  const active = new Set(data.tracks.filter((track) => !track.deletedAt).map((track) => track.id))
  const valid = (ids: string[] | undefined) => (ids ?? []).filter((id) => active.has(id))
  const layers: Array<[PlaybackContextKind, string[]]> = [
    ['focus', focusMode ? valid(data.musicContexts.focus) : []],
    ['chapter', valid(data.musicContexts.chapters[data.session.activeChapterId])],
    ['work', valid(data.musicContexts.works[data.session.activeWorkId])],
    ['global', valid(data.musicContexts.global)],
  ]
  return layers.find(([, ids]) => ids.length > 0) ?? ['global', []] as const
}

export function playbackQueueFor(data: LibraryData, kind: PlaybackContextKind) {
  const active = new Set(data.tracks.filter((track) => !track.deletedAt).map((track) => track.id))
  const scopeId = kind === 'work' ? data.session.activeWorkId : data.session.activeChapterId
  const ids = kind === 'global' || kind === 'focus'
    ? data.musicContexts[kind]
    : data.musicContexts[kind === 'work' ? 'works' : 'chapters'][scopeId] ?? []
  return ids.filter((id) => active.has(id))
}

export function createMusicSlice(get: () => LibraryStore, set: SetStore): Pick<LibraryStore, 'importTrack' | 'updateTrack' | 'trashTrack' | 'restoreTrack' | 'permanentlyDeleteTrack' | 'setMusicContext' | 'playTrack' | 'togglePlayback' | 'nextTrack' | 'previousTrack' | 'setMusicSettings'> {
  const move = (direction: 1 | -1) => { const { playback, data } = get(); if (!playback.queue.length) return; const index = Math.max(0, playback.queue.indexOf(data.session.currentTrackId ?? '')); const next = playback.queue[(index + direction + playback.queue.length) % playback.queue.length]; const updated = { ...data, session: { ...data.session, currentTrackId: next } }; set({ data: updated, playback: { ...playback, playing: true } }); void libraryRepository.save(updated) }
  return {
    importTrack: async (file) => { const track = await audioRepository.import(file); const current = get().data; commit({ ...current, tracks: [...current.tracks, track] }, set); return track },
    updateTrack: (id, changes) => { const current=get().data; commit({...current,tracks:current.tracks.map((track)=>track.id===id?{...track,title:changes.title.trim()||track.title,artist:changes.artist.trim()||'未知艺术家'}:track)},set) },
    trashTrack: (id) => {
      const { data: current, playback } = get(); const isCurrent = current.session.currentTrackId === id
      const data = { ...current, tracks: current.tracks.map((track) => track.id === id ? { ...track, deletedAt: new Date().toISOString() } : track), session: { ...current.session, currentTrackId: isCurrent ? undefined : current.session.currentTrackId } }
      set({ data, playback: { ...playback, playing: isCurrent ? false : playback.playing, queue: playback.queue.filter((item) => item !== id) } }); void libraryRepository.save(data)
    },
    restoreTrack: (id) => { const current=get().data; commit({ ...current, tracks: current.tracks.map((track) => track.id === id ? { ...track, deletedAt: undefined } : track) }, set) },
    permanentlyDeleteTrack: async (id) => { const { data: current, playback }=get(); const track=current.tracks.find((item)=>item.id===id); if(!track)return; await audioRepository.delete(track); const remove=(ids:string[])=>ids.filter((item)=>item!==id); const isCurrent=current.session.currentTrackId===id; const data={ ...current, tracks:current.tracks.filter((item)=>item.id!==id), musicContexts:{global:remove(current.musicContexts.global),focus:remove(current.musicContexts.focus),works:Object.fromEntries(Object.entries(current.musicContexts.works).map(([key,ids])=>[key,remove(ids)])),chapters:Object.fromEntries(Object.entries(current.musicContexts.chapters).map(([key,ids])=>[key,remove(ids)]))}, session:{...current.session,currentTrackId:isCurrent?undefined:current.session.currentTrackId}}; set({data,playback:{...playback,playing:isCurrent?false:playback.playing,queue:remove(playback.queue)}}); void libraryRepository.save(data) },
    setMusicContext: (kind, scopeId, trackIds) => { const current=get().data; const contexts={...current.musicContexts}; if(kind==='global'||kind==='focus') contexts[kind]=trackIds; else contexts[kind==='work'?'works':'chapters']={...contexts[kind==='work'?'works':'chapters'],[scopeId??'']:trackIds}; commit({...current,musicContexts:contexts},set) },
    playTrack: (id, context='global') => { const current=get().data; const queue=playbackQueueFor(current,context); const actualQueue=queue.includes(id)?queue:[id,...queue.filter((item)=>item!==id)]; const data={...current,session:{...current.session,currentTrackId:id}}; set({data,playback:{playing:true,context,queue:actualQueue}}); void libraryRepository.save(data) },
    togglePlayback: () => set({ playback: { ...get().playback, playing: !get().playback.playing } }),
    nextTrack: () => move(1), previousTrack: () => move(-1),
    setMusicSettings: (changes) => { const current=get().data; commit({...current,settings:{...current.settings,music:{...current.settings.music,...changes}}},set) },
  }
}
