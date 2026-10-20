import http from 'node:http'
import https from 'node:https'
import { ConfigRelay } from './config-relay.mjs'

const origins = new Set(['http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost', 'http://localhost:1420', 'http://localhost:1421', 'http://127.0.0.1:1420', 'http://127.0.0.1:1421', 'https://appassets.androidplatform.net'])
export function createHubServer(store, tls) {
  const configRelay = new ConfigRelay(store)
  const handler = async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const origin = request.headers.origin
    if (origin && !origins.has(origin)) { response.writeHead(403).end(); return }
    if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin') }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      response.writeHead(204).end(); return
    }
    const reply = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)) }
    try {
      if (request.method !== 'POST') { reply(405, { error: 'method' }); return }
      const credential = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.authorization ?? '')?.[1]
      if (!credential) { reply(401, { error: 'authentication' }); return }
      const bootstrap = ['/v1/enroll', '/v1/recover'].includes(request.url)
      const device = bootstrap ? null : store.authenticate(credential)
      if (!bootstrap && !device) { reply(401, { error: 'authentication' }); return }
      let bytes = 0
      const chunks = []
      for await (const chunk of request) {
        bytes += chunk.length
        if (bytes > 2_900_000) { reply(413, { error: 'limit' }); return }
        chunks.push(chunk)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (bootstrap && (!/^[a-f0-9-]{36}$/.test(body.device) || !/^[a-f0-9]{64}$/.test(body.token))) { reply(400, { error: 'device identity' }); return }
      if (request.url === '/v1/enroll') reply(200, store.enroll(credential, typeof body.name === 'string' ? body.name.slice(0, 60) : '我的设备', Date.now(), body))
      else if (request.url === '/v1/recover') reply(200, store.recover(credential, body.space, body.name, body))
      else if (request.url === '/v1/invites') reply(200, store.invite(device))
      else if (request.url === '/v1/devices') reply(200, { devices: store.devices(device) })
      else if (request.url === '/v1/revoke') { store.revoke(device, body.id); reply(200, { success: true }) }
      else if (request.url === '/v1/exchange') reply(200, store.exchange(device, body.after, body.envelopes))
      else if (request.url === '/v1/config') reply(200, configRelay.run(device, body))
      else reply(404, { error: 'path' })
    } catch (error) { reply(error.status ?? 400, { error: error.status ? error.message : '请求无效；未返回内部信息' }) }
  }
  const server = tls ? https.createServer(tls, handler) : http.createServer(handler)
  server.requestTimeout = 25_000
  server.headersTimeout = 10_000
  server.maxConnections = 16
  return server
}
