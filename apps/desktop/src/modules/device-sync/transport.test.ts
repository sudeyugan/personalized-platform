import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createKey, requestCode, signConfig, stableJson, verifyConfig, type ConfigRequest } from '@yiyu/sync'
import { transport } from './transport'

const rpc = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: rpc.invoke }))
const url = 'https://hub.example'
const token = 'a'.repeat(64)
const request = (): ConfigRequest => ({
  v: 1,
  id: crypto.randomUUID(),
  space: crypto.randomUUID(),
  target: crypto.randomUUID(),
  name: '虚构手机 · 中文与\\转义',
  publicKey: 'A'.repeat(124),
  scopes: ['model'],
  follow: true,
  expires: Date.now() + 600000,
})

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
  rpc.invoke.mockReset()
})
afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  vi.unstubAllGlobals()
})

describe('native sync JSON transport', () => {
  it('keeps incoming request authentication and device codes unchanged across IPC', async () => {
    const key = createKey(), value = request()
    const signed = await signConfig('request', value, key)
    const wire = JSON.stringify({ channels: [{ request: signed, source: null, packet: null, acknowledged: 0 }] })
    rpc.invoke.mockResolvedValue(wire)
    const result = await transport(url, '/v1/config', token, { operation: 'poll' }) as {
      channels: Array<{ request: typeof signed }>
    }
    const received = result.channels[0].request
    expect(JSON.stringify(received)).toBe(JSON.stringify(signed))
    expect(await verifyConfig('request', received, key)).toEqual(value)
    expect(await requestCode(received.value)).toBe(await requestCode(value))
    expect(rpc.invoke).toHaveBeenCalledWith('device_sync_request', {
      url, path: '/v1/config', token, body: '{"operation":"poll"}',
    })
    // The previous Value-based bridge reordered this object and invalidated its MAC.
    await expect(verifyConfig('request', JSON.parse(stableJson(signed)), key)).rejects.toThrow('校验失败')
  })

  it('sends a signed packet as original JSON text rather than a native object', async () => {
    const key = createKey(), id = crypto.randomUUID()
    const packet = await signConfig(`packet:${id}`, {
      source: crypto.randomUUID(), sequence: 1, ephemeral: 'A'.repeat(124), iv: 'A'.repeat(16), body: 'A'.repeat(48),
    }, key)
    const payload = { operation: 'deliver', id, packet }
    rpc.invoke.mockImplementation(async (_command, args) => {
      expect(typeof args.body).toBe('string')
      expect(args.body).toBe(JSON.stringify(payload))
      expect(await verifyConfig(`packet:${id}`, JSON.parse(args.body).packet, key)).toEqual(packet.value)
      return '{"success":true}'
    })
    expect(await transport(url, '/v1/config', token, payload)).toEqual({ success: true })
  })

  it('still rejects modified scopes and ciphertext after the transport boundary', async () => {
    const key = createKey(), signed = await signConfig('request', request(), key)
    rpc.invoke.mockResolvedValue(JSON.stringify({ ...signed, value: { ...signed.value, scopes: ['voice'] } }))
    const received = await transport(url, '/v1/config', token, { operation: 'poll' }) as typeof signed
    await expect(verifyConfig('request', received, key)).rejects.toThrow('校验失败')
    const id = crypto.randomUUID()
    const packet = await signConfig(`packet:${id}`, { source: crypto.randomUUID(), sequence: 1, ephemeral: 'A'.repeat(124), iv: 'A'.repeat(16), body: 'A'.repeat(48) }, key)
    rpc.invoke.mockResolvedValue(JSON.stringify({ ...packet, value: { ...packet.value, body: 'B'.repeat(48) } }))
    const tampered = await transport(url, '/v1/config', token, { operation: 'poll' }) as typeof packet
    await expect(verifyConfig(`packet:${id}`, tampered, key)).rejects.toThrow('校验失败')
  })

  it('does not accept an invalid JSON reply or fall back after native failure', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    rpc.invoke.mockResolvedValue('not-json')
    await expect(transport(url, '/v1/config', token, {})).rejects.toThrow(SyntaxError)
    rpc.invoke.mockRejectedValue(new Error('native request rejected'))
    await expect(transport(url, '/v1/config', token, {})).rejects.toThrow('native request rejected')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retains the existing fetch path for browser previews', async () => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    const fetch = vi.fn(async () => new Response('{"channels":[]}'))
    vi.stubGlobal('fetch', fetch)
    expect(await transport(url, '/v1/config', token, { operation: 'poll' })).toEqual({ channels: [] })
    expect(rpc.invoke).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledOnce()
  })
})
