import { describe, expect, it, vi } from 'vitest'
import { capture, createKey, SyncClient, type SyncState, type Transport } from '@yiyu/sync'
const state = (): SyncState => ({
  v: 1,
  config: {
    space: '11111111-1111-4111-a111-111111111111',
    device: crypto.randomUUID(),
    token: 'f'.repeat(64),
    key: createKey(),
    name: 'test',
    url: 'https://old.example',
  },
  cursor: 0,
  pending: [],
  operations: [],
  baseline: {},
  selected: {},
})
describe('safe hub relocation', () => {
  it('probes read-only, authenticates the known cursor and retains keys, outbox and selection', async () => {
    const original = state()
    await capture(original, { 'todos/a': { id: 'a', title: '先前的记录' } })
    const first = original.pending[0]
    original.cursor = 1
    original.pending = []
    await capture(original, { 'todos/a': { id: 'a', title: '尚未发送' } })
    const send = vi.fn<Transport>(async (_url, _path, _token, body) => {
      expect(body).toEqual({ after: 0, envelopes: [] })
      return {
        space: original.config.space,
        cursor: 1,
        more: false,
        entries: [{ seq: 1, envelope: first }],
      }
    })
    const persist = vi.fn(async () => undefined)
    const client = new SyncClient(original, {
      read: () => ({}),
      apply: async () => true,
      persist,
      transport: send,
    })
    await client.moveEndpoint('https://new.example')
    expect(client.state).toEqual({
      ...original,
      config: { ...original.config, url: 'https://new.example' },
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledTimes(1)
  })
  it('does not change the old address on wrong hub, stale history, HTTP, decryption or save failure', async () => {
    for (const failure of ['space', 'stale', 'cipher', 'save', 'http']) {
      const original = state()
      await capture(original, { 'todos/a': { id: 'a', title: '旧记录' } })
      original.cursor = 1
      const envelope = original.pending[0]
      const client = new SyncClient(original, {
        read: () => ({}),
        apply: async () => true,
        persist: async () => {
          if (failure === 'save') throw Error('disk full')
        },
        transport: async () => ({
          space: failure === 'space' ? 'wrong' : original.config.space,
          more: false,
          cursor: failure === 'stale' ? 0 : 1,
          entries:
            failure === 'stale'
              ? []
              : [
                  {
                    seq: 1,
                    envelope:
                      failure === 'cipher' ? { ...envelope, body: 'X'.repeat(24) } : envelope,
                  },
                ],
        }),
      })
      await expect(
        client.moveEndpoint(failure === 'http' ? 'http://new.example' : 'https://new.example'),
      ).rejects.toThrow()
      expect(client.state).toBe(original)
    }
  })
})
