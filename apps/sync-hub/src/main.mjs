import { readFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseArgs } from 'node:util'
import { HubStore } from './store.mjs'
import { createHubServer } from './server.mjs'

const { values } = parseArgs({ options: {
  init: { type: 'boolean' }, data: { type: 'string', default: './.yiyu-hub' },
  host: { type: 'string', default: '127.0.0.1' }, port: { type: 'string', default: '17839' },
  cert: { type: 'string' }, key: { type: 'string' },
} })
if ((!values.cert || !values.key) && !['127.0.0.1', '::1', 'localhost'].includes(values.host)) throw new Error('非本机监听必须明确配置受信任的 HTTPS 证书和私钥；不会降级 TLS。')
const directory = resolve(values.data)
mkdirSync(directory, { recursive: true, mode: 0o700 })
const store = new HubStore(join(directory, 'hub.sqlite'))
if (values.init) {
  // Only a deliberate initialization prints this once. Never print routine tokens/content.
  console.log(`首次连接凭证（仅显示这一次，请私下保存）：${store.initialize()}`)
  store.close()
} else {
  if (!store.get('owner')) { store.close(); throw new Error('先用 --init 显式初始化中枢。') }
  const tls = values.cert && values.key ? { cert: readFileSync(values.cert), key: readFileSync(values.key), minVersion: 'TLSv1.2' } : undefined
  const server = createHubServer(store, tls)
  server.listen(Number(values.port), values.host, () => console.log(`一隅密文中枢已监听 ${tls ? 'HTTPS' : '本机 HTTP'} ${values.host}:${values.port}；未安装服务或修改防火墙。`))
  const stop = () => server.close(() => { store.close(); process.exit(0) })
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
}
