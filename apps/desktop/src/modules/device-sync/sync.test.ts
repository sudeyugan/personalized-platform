import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { capture, conflicts, createKey, heads, materialize, open, receive, resolve, seal, serverUrl, SyncClient, type Envelope, type Records, type SyncState, type Transport } from '@yiyu/sync'
import { createSeedLibrary } from '../../domain/seed'
import { mergeLibrary, projectLibrary } from './libraryProjection'

const space = '11111111-1111-4111-a111-111111111111'
const fresh = (key = createKey()): SyncState => ({ v: 1, config: { key, space, url: 'https://hub.example', device: crypto.randomUUID(), token: 'test', name: 'test' }, cursor: 0, operations: [], pending: [], baseline: {}, selected: {} })
const todo = (title: string): Records => ({ 'todos/task-1': { id: 'task-1', title, note: '', completed: false, priority: 'medium', createdAt: '2026-10-18' } })
beforeEach(() => { vi.stubGlobal('crypto', webcrypto) })

describe('encrypted record sync', () => {
  it('authenticates space, device and ciphertext; rejects wrong keys', async () => {
    const a = fresh(); await capture(a, todo('私人内容'))
    expect(JSON.stringify(a.pending)).not.toContain('私人内容')
    expect((await open(a.pending[0], a.config.key, space)).value?.title).toBe('私人内容')
    await expect(open(a.pending[0], createKey(), space)).rejects.toThrow()
    await expect(open(a.pending[0], a.config.key, 'other')).rejects.toThrow()
    await expect(open({ ...a.pending[0], device: crypto.randomUUID() }, a.config.key, space)).rejects.toThrow()
    await expect(open({ ...a.pending[0], body: a.pending[0].body.replace(/^./, 'X') }, a.config.key, space)).rejects.toThrow()
  })
  it('keeps both offline edits and a deletion until an explicit resolution', async () => {
    const a = fresh(), b = fresh(a.config.key)
    await capture(a, todo('original'))
    await receive(b, a.pending[0]); b.baseline = materialize(b); b.selected['todos/task-1'] = b.operations[0].id
    await capture(a, todo('A changed')); await capture(b, {})
    await receive(a, b.pending[0]); await receive(b, a.pending[1])
    expect(conflicts(a)).toEqual(['todos/task-1'])
    expect(heads(a, 'todos/task-1').map(item => item.value?.title ?? 'deleted').sort()).toEqual(['A changed', 'deleted'])
    await resolve(a, 'todos/task-1', a.pending[1].id)
    await receive(b, a.pending[2])
    expect(conflicts(b)).toEqual([])
    expect(materialize(b)['todos/task-1'].title).toBe('A changed')
    expect(b.operations).toHaveLength(4)
  })
  it('does not turn an unseen remote version into a local edit parent', async () => {
    const a = fresh(), b = fresh(a.config.key)
    await capture(a, todo('base')); await receive(b, a.pending[0])
    b.baseline = materialize(b); b.selected['todos/task-1'] = b.operations[0].id
    await capture(a, todo('remote')); await receive(b, a.pending[1])
    await capture(b, todo('typed while remote was being fetched'))
    expect(conflicts(b)).toHaveLength(1)
  })
  it('deduplicates retries and fails closed on missing ancestry', async () => {
    const a = fresh(), b = fresh(a.config.key)
    await capture(a, todo('a')); await capture(a, todo('b'))
    await expect(receive(b, a.pending[1])).rejects.toThrow('历史不完整')
    await receive(b, a.pending[0]); await receive(b, a.pending[0])
    expect(b.operations).toHaveLength(1)
    const bad = { ...a.operations[0], key: 'settings/apiKey' }
    await expect(seal(bad, a.config.key, space)).rejects.toThrow()
  })
  it('requires HTTPS outside localhost', () => {
    expect(serverUrl('http://127.0.0.1:17839')).toBe('http://127.0.0.1:17839')
    for (const url of ['http://192.168.1.2', 'https://user:secret@hub.example', 'https://hub.example/path', 'https://hub.example/#key']) expect(() => serverUrl(url)).toThrow()
  })
  it('forks alternate ideas on resolution instead of mixing turn order', async () => {
    const a = fresh(), b = fresh(a.config.key), key = 'ideas/idea-1'
    const idea = { id: 'idea-1', seed: 'a seed', title: 'idea', draft: 'base', turns: [] }
    await capture(a, { [key]: idea }); await receive(b, a.pending[0])
    b.baseline = materialize(b); b.selected[key] = b.operations[0].id
    await capture(a, { [key]: { ...idea, draft: 'A' } }); await capture(b, { [key]: { ...idea, draft: 'B' } })
    await receive(a, b.pending[0]); await resolve(a, key, a.pending[1].id)
    const records = materialize(a)
    expect(records[key].draft).toBe('A')
    const fork = Object.values(records).find(value => value.forkOf === 'idea-1')
    expect(fork?.draft).toBe('B')
    expect(conflicts(a)).toEqual([])
  })
  it('does not consume quota by creating operations for property-order changes', async () => {
    const a = fresh(); await capture(a, todo('one'))
    await capture(a, Object.fromEntries(Object.entries(todo('one')).map(([key, value]) => [key, Object.fromEntries(Object.entries(value).reverse())])))
    expect(a.pending).toHaveLength(1)
  })
})

describe('durable clients', () => {
  function setup() {
    const log: Envelope[] = []
    let offline = false
    const transport: Transport = async (_url, _path, _token, body) => {
      if (offline) throw new Error('offline')
      const request = body as { after: number; envelopes: Envelope[] }
      for (const envelope of request.envelopes) if (!log.some(item => item.id === envelope.id)) log.push(envelope)
      const entries = log.slice(request.after, request.after + 4).map((envelope, i) => ({ seq: request.after + i + 1, envelope }))
      return { space, cursor: entries.at(-1)?.seq ?? request.after, more: log.length > request.after + 4, entries }
    }
    function device(state: SyncState) {
      let records: Records = {}, durable = state, busy = false
      const client = new SyncClient(state, { read: () => records, apply: async value => { if (busy) return false; records = value; return true }, persist: async value => { durable = structuredClone(value) }, transport })
      return { client, read: () => records, edit: (value: Records) => { records = value }, durable: () => durable, busy: (value: boolean) => { busy = value } }
    }
    return { device, log, offline: (value: boolean) => { offline = value } }
  }
  it('recovers offline outbox and merges different records across two devices', async () => {
    const env = setup(), state = fresh(), a = env.device(state), b = env.device(fresh(state.config.key))
    a.edit(todo('one')); env.offline(true)
    await expect(a.client.sync()).rejects.toThrow('offline')
    expect(a.durable().pending).toHaveLength(1)
    env.offline(false); await a.client.sync(); await b.client.sync()
    expect(b.read()).toEqual(todo('one'))
    b.edit({ ...b.read(), 'diary/2026-10-18': { date: '2026-10-18', title: 'day', content: 'hello', updatedAt: 'now' } })
    await b.client.sync(); await a.client.sync()
    expect(a.read()).toEqual(b.read())
    expect(env.log).toHaveLength(2)
  })
  it('does not send anything if outbox persistence fails', async () => {
    const send = vi.fn()
    const client = new SyncClient(fresh(), { read: () => todo('hello'), apply: async () => true, transport: send, persist: async () => { throw new Error('disk full') } })
    await expect(client.sync()).rejects.toThrow('disk full')
    expect(send).not.toHaveBeenCalled()
    expect(client.state.pending).toEqual([])
  })
  it('retains remote changes while editor is busy and applies on next pass', async () => {
    const env = setup(), state = fresh(), a = env.device(state), b = env.device(fresh(state.config.key))
    a.edit(todo('hello')); await a.client.sync()
    b.busy(true); await b.client.sync(); expect(b.read()).toEqual({})
    b.busy(false); await b.client.sync(); expect(b.read()).toEqual(todo('hello'))
  })
})

describe('library boundary', () => {
  it('excludes all device settings, conversations, browser permissions and encrypted works', () => {
    const data = createSeedLibrary()
    data.companion.messages = [{ id: 'secret', role: 'user', content: 'private-chat' }] as never
    data.works[0] = { ...data.works[0], encrypted: true }
    const records = projectLibrary(data)
    expect(records[`works/${data.works[0].id}`]).toBeUndefined()
    expect(Object.keys(records).some(key => key.startsWith('chapters/'))).toBe(false)
    expect(JSON.stringify(records)).not.toContain('private-chat')
    expect(Object.keys(records).some(key => /settings|companion|assets/.test(key))).toBe(false)
  })
  it('round trips eligible records without dropping local settings, vaults or asset metadata', () => {
    const data = createSeedLibrary(), records = projectLibrary(data)
    const merged = mergeLibrary(data, records)
    expect(projectLibrary(merged)).toEqual(records)
    expect(merged.settings).toEqual(data.settings)
    expect(merged.companion).toEqual(data.companion)
    expect(merged.assets).toEqual(data.assets)
  })
  it('rejects unknown record fields rather than importing permission/secret data', () => {
    const data = createSeedLibrary(), records = projectLibrary(data)
    const key = Object.keys(records)[0]
    records[key].encrypted = true
    expect(() => mergeLibrary(data, records)).toThrow('未知字段')
  })
  it('rejects malformed payloads and maps mood slots to a common identity', () => {
    const data = createSeedLibrary()
    data.planner.moodEntries = [{ id: 'random-on-device-a', date: '2026-10-18', period: 'evening', points: { calm: 5 }, createdAt: 'now', updatedAt: 'now' }]
    const records = projectLibrary(data)
    expect(records['moods/2026-10-18-evening'].id).toBe('2026-10-18-evening')
    records['works/work-memoir'].title = { nested: 'not text' }
    expect(() => mergeLibrary(data, records)).toThrow('文本格式无效')
  })
  it('repairs only local navigation when a remote chapter is removed', () => {
    const data = createSeedLibrary(), records = projectLibrary(data)
    delete records[`chapters/${data.session.activeChapterId}`]
    const merged = mergeLibrary(data, records)
    expect(merged.session.activeChapterId).toBe('')
    expect(merged.session.openChapterIds).toEqual([])
    expect(merged.companion).toEqual(data.companion)
  })
})
