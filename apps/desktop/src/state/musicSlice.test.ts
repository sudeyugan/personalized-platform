import { describe, expect, it } from 'vitest'
import { createSeedLibrary } from '../domain/seed'
import { playbackQueueFor, resolvePlaybackContext } from './musicSlice'

describe('playback context resolution', () => {
  it('uses focus, chapter, work and global in descending specificity', () => {
    const data=createSeedLibrary(); data.tracks=[{id:'track-a',title:'A',artist:'',fileName:'a.mp3',mimeType:'audio/mpeg',size:1,sha256:'a',createdAt:''},{id:'track-b',title:'B',artist:'',fileName:'b.mp3',mimeType:'audio/mpeg',size:1,sha256:'b',createdAt:''}]
    data.musicContexts.global=['track-a']; data.musicContexts.works[data.session.activeWorkId]=['track-b']
    expect(resolvePlaybackContext(data,false)).toEqual(['work',['track-b']])
    data.musicContexts.chapters[data.session.activeChapterId]=['track-a']; expect(resolvePlaybackContext(data,false)[0]).toBe('chapter')
    data.musicContexts.focus=['track-b']; expect(resolvePlaybackContext(data,true)).toEqual(['focus',['track-b']])
  })
  it('ignores deleted and missing tracks', () => { const data=createSeedLibrary(); data.musicContexts.global=['missing']; expect(resolvePlaybackContext(data)[1]).toEqual([]) })
  it('keeps the explicitly selected context order for manual playback', () => {
    const data=createSeedLibrary(); data.tracks=[{id:'global',title:'A',artist:'',fileName:'a.mp3',mimeType:'audio/mpeg',size:1,sha256:'a',createdAt:''},{id:'chapter',title:'B',artist:'',fileName:'b.mp3',mimeType:'audio/mpeg',size:1,sha256:'b',createdAt:''}]
    data.musicContexts.global=['global']; data.musicContexts.chapters[data.session.activeChapterId]=['chapter']
    expect(playbackQueueFor(data,'global')).toEqual(['global'])
    expect(playbackQueueFor(data,'chapter')).toEqual(['chapter'])
  })
})
