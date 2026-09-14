import { invoke } from '@tauri-apps/api/core'
import type { Track } from '../domain/models'

interface Receipt { id: string; fileName: string; mimeType: Track['mimeType']; size: number; sha256: string }
const browserAudio = new Map<string, Blob>()
const isTauri = () => '__TAURI_INTERNALS__' in window
const accepted = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/flac'])
const normalizedMime = (mime: string): Track['mimeType'] => mime === 'audio/x-wav' ? 'audio/wav' : mime === 'audio/x-m4a' ? 'audio/mp4' : mime as Track['mimeType']

export const audioRepository = {
  async import(file: File): Promise<Track> {
    if (!accepted.has(file.type)) throw new Error('仅支持 MP3、WAV、OGG、M4A 和 FLAC 音频')
    if (file.size > 200 * 1024 * 1024) throw new Error('音频必须小于 200 MB')
    const mimeType = normalizedMime(file.type)
    let receipt: Receipt
    if (isTauri()) receipt = await invoke('import_audio_track', { fileName: file.name, mimeType, bytes: [...new Uint8Array(await file.arrayBuffer())] })
    else { const id = `track-${crypto.randomUUID()}`; browserAudio.set(id, file); receipt = { id, fileName: file.name, mimeType, size: file.size, sha256: `preview-${id}` } }
    return { ...receipt, title: file.name.replace(/\.[^.]+$/, ''), artist: '未知艺术家', createdAt: new Date().toISOString() }
  },
  async readUrl(track: Pick<Track, 'id' | 'mimeType'>) { const bytes = isTauri() ? new Uint8Array(await invoke<number[]>('read_audio_track', track)) : new Uint8Array(await browserAudio.get(track.id)!.arrayBuffer()); return URL.createObjectURL(new Blob([bytes], { type: track.mimeType })) },
  async delete(track: Pick<Track, 'id' | 'mimeType'>) { if (isTauri()) await invoke('delete_audio_track', track); else browserAudio.delete(track.id) },
}
