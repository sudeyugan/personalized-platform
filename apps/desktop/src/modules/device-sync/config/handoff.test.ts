import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConfigHandoff,
  configContext,
  createKey,
  requestCode,
  signConfig,
  verifyConfig,
  type ConfigChannel,
  type ConfigNative,
  type ConfigPacket,
  type ConfigRequest,
  type PublicConfig,
  type SyncConfig,
  type Transport,
} from '@yiyu/sync'

const { storage } = vi.hoisted(() => ({ storage: new Map<string, unknown>() }))
vi.mock('../../../../../../packages/sync/src/config-handoff/storage', () => ({
  configLocal: async (key: string, value?: unknown) => {
    if (value !== undefined) storage.set(key, structuredClone(value))
    return structuredClone(storage.get(key))
  },
}))
const space = '11111111-1111-4111-a111-111111111111'
const publicKey = 'A'.repeat(124)
function config(key = createKey()): SyncConfig {
  return {
    url: 'https://hub.example',
    space,
    key,
    device: crypto.randomUUID(),
    token: 'fictional',
    name: '虚构设备',
  }
}
function native(
  config: PublicConfig = { model: { model: 'deepseek-chat' }, revision: 'local-1' },
): ConfigNative {
  return {
    authorize: vi.fn(async () => undefined),
    revoke: vi.fn(async () => undefined),
    identity: vi.fn(async () => publicKey),
    available: vi.fn(async () => config),
    seal: vi.fn(async () => ({ ephemeral: publicKey, iv: 'A'.repeat(16), body: 'A'.repeat(48) })),
    apply: vi.fn(async (): Promise<PublicConfig> => ({ model: { model: 'deepseek-chat' } })),
    detach: vi.fn(async () => undefined),
    state: vi.fn(async () => ({})),
    applyPublic: vi.fn(async () => undefined),
  }
}
function mailbox() {
  const channels: ConfigChannel[] = []
  let offline = false
  let ackFails = false
  const transport: Transport = vi.fn(async (_url, _path, _token, raw) => {
    if (offline) throw new Error('offline')
    const body = raw as {
      operation: string
      request: ConfigChannel['request']
      packet: ConfigChannel['packet']
      id: string
      sequence: number
    }
    if (
      body.operation === 'request' &&
      !channels.some((item) => item.request.value.id === body.request.value.id)
    )
      channels.push({
        request: structuredClone(body.request),
        source: null,
        packet: null,
        acknowledged: 0,
      })
    if (body.operation === 'deliver') {
      const row = channels.find((item) => item.request.value.id === body.id)!
      row.packet = body.packet
      row.source = body.packet!.value.source
    }
    if (body.operation === 'ack') {
      if (ackFails) {
        ackFails = false
        throw new Error('lost ack')
      }
      const row = channels.find((item) => item.request.value.id === body.id)!
      row.acknowledged = body.sequence
      row.packet = null
    }
    if (body.operation === 'cancel' || body.operation === 'reject') {
      const index = channels.findIndex((item) => item.request.value.id === body.id)
      if (index >= 0) channels.splice(index, 1)
    }
    return { channels: structuredClone(channels) }
  })
  return {
    channels,
    transport,
    offline: (value: boolean) => {
      offline = value
    },
    failAck: () => {
      ackFails = true
    },
  }
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  storage.clear()
})
describe('separate per-device configuration handoff', () => {
  it('authenticates request, scope, target and ciphertext against a keyless relay', async () => {
    const key = createKey(),
      request: ConfigRequest = {
        v: 1,
        id: crypto.randomUUID(),
        space,
        target: crypto.randomUUID(),
        name: '手机',
        publicKey,
        scopes: ['model'],
        follow: true,
        expires: Date.now() + 600000,
      }
    const signed = await signConfig('request', request, key)
    expect(await verifyConfig('request', signed, key)).toEqual(request)
    await expect(
      verifyConfig('request', { ...signed, value: { ...request, scopes: ['voice'] } }, key),
    ).rejects.toThrow()
    await expect(verifyConfig('request', signed, createKey())).rejects.toThrow()
    expect(configContext(request, crypto.randomUUID(), 1)).not.toContain('手机')
    expect(await requestCode({ ...request, target: crypto.randomUUID() })).not.toBe(
      await requestCode(request),
    )
  })
  it('requires approval, follows compatible updates and skips unchanged configurations', async () => {
    const server = mailbox(),
      a = config(),
      b = config(a.key),
      source = native(),
      target = native()
    const old = new ConfigHandoff(a, server.transport, source),
      next = new ConfigHandoff(b, server.transport, target)
    await next.request(['model'], true)
    const [pending] = await old.tick()
    expect(source.seal).not.toHaveBeenCalled()
    await expect(old.approve(pending, 'wrong')).rejects.toThrow()
    await old.approve(pending, await requestCode(pending.request.value))
    expect(source.seal).toHaveBeenCalledOnce()
    await next.tick()
    expect(target.apply).toHaveBeenCalledOnce()
    expect(target.applyPublic).toHaveBeenCalledWith({ model: { model: 'deepseek-chat' } })
    await old.tick()
    expect(source.seal).toHaveBeenCalledOnce()
    vi.mocked(source.available).mockResolvedValue({
      model: { model: 'deepseek-chat' },
      revision: 'local-2',
    })
    await old.tick()
    await next.tick()
    expect(target.apply).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(storage.values().next().value)).not.toContain('apiKey')
  })
  it('persists requests before network and retries lost acknowledgements without reapplying', async () => {
    const server = mailbox(),
      a = config(),
      b = config(a.key),
      source = native(),
      target = native()
    let next = new ConfigHandoff(b, server.transport, target)
    server.offline(true)
    await expect(next.request(['model'], true)).rejects.toThrow('offline')
    expect((await next.status()).incoming).toBeTruthy()
    server.offline(false)
    next = new ConfigHandoff(b, server.transport, target)
    await next.tick()
    const old = new ConfigHandoff(a, server.transport, source),
      [pending] = await old.tick()
    await old.approve(pending, await requestCode(pending.request.value))
    server.failAck()
    await expect(next.tick()).rejects.toThrow('lost ack')
    await next.tick()
    expect(target.apply).toHaveBeenCalledOnce()
    expect(server.channels[0].acknowledged).toBe(1)
  })
  it('offline stop is durable and cannot be undone by a queued update', async () => {
    const server = mailbox(),
      a = config(),
      target = native(),
      next = new ConfigHandoff(a, server.transport, target)
    await next.request(['model'], true)
    server.offline(true)
    await expect(next.stop()).rejects.toThrow('offline')
    expect((await next.status()).incoming?.stopped).toBe(true)
    expect(target.detach).toHaveBeenCalledOnce()
    server.offline(false)
    await next.tick()
    expect(server.channels).toHaveLength(0)
    expect(target.apply).not.toHaveBeenCalled()
  })
  it('rejects request replacement, wrong scope and provider configurations that are unavailable', async () => {
    const server = mailbox(),
      a = config(),
      b = config(a.key),
      next = new ConfigHandoff(b, server.transport, native())
    await next.request(['model', 'voice'], true)
    const old = new ConfigHandoff(a, server.transport, native()),
      [pending] = await old.tick()
    await expect(old.approve(pending, await requestCode(pending.request.value))).rejects.toThrow(
      '尚未配置',
    )
    server.channels[0].request.value.publicKey = 'B'.repeat(124)
    await expect(next.tick()).rejects.toThrow()
  })
  it('respects native manual override and halts after the connection closes', async () => {
    const server = mailbox(),
      a = config(),
      b = config(a.key),
      source = native(),
      target = native()
    const old = new ConfigHandoff(a, server.transport, source),
      next = new ConfigHandoff(b, server.transport, target)
    await next.request(['model'], true)
    const [pending] = await old.tick()
    await old.approve(pending, await requestCode(pending.request.value))
    await next.tick()
    vi.mocked(target.state).mockResolvedValue({ request: pending.request.value.id, detached: true })
    await next.tick()
    expect((await next.status()).incoming?.stopped).toBe(true)
    old.close()
    await expect(old.tick()).rejects.toThrow('已停止')
    expect(target.apply).toHaveBeenCalledOnce()
  })
  it('rejects forged packet authentication before invoking native import', async () => {
    const server = mailbox(),
      a = config(),
      target = native(),
      next = new ConfigHandoff(a, server.transport, target)
    await next.request(['model'], true)
    const packet: ConfigPacket = {
      source: crypto.randomUUID(),
      sequence: 1,
      ephemeral: publicKey,
      iv: 'A'.repeat(16),
      body: 'A'.repeat(48),
    }
    server.channels[0].source = packet.source
    server.channels[0].packet = await signConfig(
      `packet:${server.channels[0].request.value.id}`,
      packet,
      createKey(),
    )
    await expect(next.tick()).rejects.toThrow('校验失败')
    expect(target.apply).not.toHaveBeenCalled()
  })
  it('does not resubmit a rejected request on background polling', async () => {
    const server = mailbox(),
      a = config(),
      next = new ConfigHandoff(a, server.transport, native())
    await next.request(['model'], true)
    const id = server.channels[0].request.value.id
    await server.transport(a.url, '/v1/config', a.token, { operation: 'reject', id })
    await next.tick()
    expect((await next.status()).incoming?.stopped).toBe(true)
    expect(server.channels).toHaveLength(0)
  })
  it('retries a failed public-settings save before acknowledging native import', async () => {
    const server = mailbox(),
      a = config(),
      b = config(a.key),
      source = native(),
      target = native()
    const old = new ConfigHandoff(a, server.transport, source),
      next = new ConfigHandoff(b, server.transport, target)
    await next.request(['model'], true)
    const [pending] = await old.tick()
    await old.approve(pending, await requestCode(pending.request.value))
    vi.mocked(target.applyPublic).mockRejectedValueOnce(new Error('disk full'))
    await expect(next.tick()).rejects.toThrow('disk full')
    expect(server.channels[0].acknowledged).toBe(0)
    await next.tick()
    expect(server.channels[0].acknowledged).toBe(1)
  })
  it('a one-time copy never subscribes to subsequent changes', async () => {
    const server = mailbox(),
      a = config(),
      b = config(a.key),
      source = native(),
      target = native()
    const old = new ConfigHandoff(a, server.transport, source),
      next = new ConfigHandoff(b, server.transport, target)
    await next.request(['model'], false)
    const [pending] = await old.tick()
    await old.approve(pending, await requestCode(pending.request.value))
    await next.tick()
    expect((await next.status()).incoming?.stopped).toBe(true)
    vi.mocked(source.available).mockResolvedValue({
      model: { model: 'deepseek-chat' },
      revision: 'changed',
    })
    await old.tick()
    expect(source.seal).toHaveBeenCalledOnce()
  })
  it('changing the local public model stops an existing subscription', async () => {
    const server = mailbox(),
      a = config(),
      b = config(a.key),
      source = native(),
      target = native()
    const old = new ConfigHandoff(a, server.transport, source),
      next = new ConfigHandoff(b, server.transport, target)
    await next.request(['model'], true)
    const [pending] = await old.tick()
    await old.approve(pending, await requestCode(pending.request.value))
    await next.tick()
    vi.mocked(target.available).mockResolvedValue({
      model: { model: 'deepseek-reasoner' },
      revision: 'local override',
    })
    await next.tick()
    expect((await next.status()).incoming?.stopped).toBe(true)
    expect(target.detach).toHaveBeenCalledOnce()
  })
  it('native rejection cannot be replaced by WebView approval state', async () => {
    const server = mailbox(),
      a = config(),
      b = config(a.key),
      source = native(),
      target = native()
    const old = new ConfigHandoff(a, server.transport, source),
      next = new ConfigHandoff(b, server.transport, target)
    await next.request(['model'], true)
    const [pending] = await old.tick()
    vi.mocked(source.authorize).mockRejectedValueOnce(new Error('native cancelled'))
    await expect(old.approve(pending, await requestCode(pending.request.value))).rejects.toThrow(
      'native cancelled',
    )
    expect(source.seal).not.toHaveBeenCalled()
    expect((await old.status()).approvals).toBe(0)
  })
})
