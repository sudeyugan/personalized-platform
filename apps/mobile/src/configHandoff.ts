import {
  ConfigHandoff,
  configContext,
  fetchTransport,
  type PublicConfig,
  type SyncConfig,
} from '@yiyu/sync'
import './native'
async function run<T>(operation: string, input: unknown = {}): Promise<T> {
  const result = window.YiyuMobile?.configHandoff?.(operation, JSON.stringify(input))
  if (!result) throw new Error('此版本尚不支持原生配置交接，请更新安装包。')
  const response = JSON.parse(result) as { ok: boolean; value: T }
  if (!response.ok) throw new Error('配置交接失败；原配置保留。请检查范围、本机覆盖和兼容服务。')
  return response.value
}
let cached: { key: string; url: string; client: ConfigHandoff } | undefined
export function mobileConfigHandoff(config: SyncConfig) {
  if (!window.YiyuMobile?.configHandoff) return undefined
  const key = `${config.space}/${config.device}`
  if (!cached || cached.key !== key || cached.url !== config.url) {
    cached?.client.close()
    cached = {
      key,
      url: config.url,
      client: new ConfigHandoff(config, fetchTransport, {
        authorize: async (request) => {
          await run('authorize', {
            request: JSON.stringify(request),
            context: configContext(request, config.device, 1),
          })
        },
        revoke: async (request) => {
          await run('revoke', { context: configContext(request, config.device, 1) })
        },
        identity: () => run('identity'),
        available: () => run('available'),
        seal: (_publicKey, context, value) => run('seal', { context, config: value }),
        apply: (context, packet) => run('apply', { context, packet }),
        detach: async () => {
          await run('detach')
        },
        state: () => run('state'),
        applyPublic: async (value: PublicConfig) => {
          if (value.voice) localStorage.setItem('yiyu.mobile.voice-id', value.voice.voice)
          window.dispatchEvent(new Event('yiyu-config-updated'))
        },
      }),
    }
  }
  return cached.client
}
