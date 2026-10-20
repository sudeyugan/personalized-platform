import { invoke } from '@tauri-apps/api/core'
import {
  ConfigHandoff,
  configContext,
  type ConfigNative,
  type PublicConfig,
  type SyncConfig,
} from '@yiyu/sync'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { libraryRepository } from '../../../infrastructure/libraryRepository'
import { isDeviceSyncActive, transport } from '../runtime'

const run = <T>(operation: string, input: unknown = {}) =>
  invoke<T>('device_config_native', { operation, input })
function supported(): PublicConfig {
  const { provider, voice } = useLibraryStore.getState().data.companion
  const config: PublicConfig = {}
  if (
    provider.providerId === 'deepseek' &&
    ['https://api.deepseek.com', 'https://api.deepseek.com/v1'].includes(
      provider.endpoint.replace(/\/$/, ''),
    ) &&
    ['deepseek-chat', 'deepseek-reasoner'].includes(provider.model)
  )
    config.model = { model: provider.model as 'deepseek-chat' | 'deepseek-reasoner' }
  if (
    voice.stt.providerId === 'elevenlabs' &&
    voice.tts.providerId === 'elevenlabs' &&
    ['scribe_v1', 'scribe_v2'].includes(voice.stt.model) &&
    ['eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2_5'].includes(
      voice.tts.model,
    ) &&
    /^[A-Za-z0-9_-]{10,100}$/.test(voice.tts.voice)
  )
    config.voice = { voice: voice.tts.voice, sttModel: voice.stt.model, ttsModel: voice.tts.model }
  return config
}
function nativeFor(connection: SyncConfig): ConfigNative {
  return {
    authorize: async (request) => {
      await run('authorize', {
        request: JSON.stringify(request),
        context: configContext(request, connection.device, 1),
      })
    },
    revoke: async (request) => {
      await run('revoke', { context: configContext(request, connection.device, 1) })
    },
    identity: () => run('identity'),
    available: () => run('available', supported()),
    seal: (_publicKey, context, config) => run('seal', { context, config }),
    apply: (context, packet) => run('apply', { context, packet }),
    detach: async () => {
      await run('detach')
    },
    state: () => run('state'),
    applyPublic: async (config) => {
      const store = useLibraryStore.getState()
      if (config.model)
        store.setCompanionProvider({
          providerId: 'deepseek',
          endpoint: 'https://api.deepseek.com',
          model: config.model.model,
        })
      if (config.voice)
        store.setCompanionVoice({
          stt: {
            providerId: 'elevenlabs',
            endpoint: 'https://api.elevenlabs.io',
            model: config.voice.sttModel,
          },
          tts: {
            providerId: 'elevenlabs',
            endpoint: 'https://api.elevenlabs.io',
            model: config.voice.ttsModel,
            voice: config.voice.voice,
          },
        })
      // Existing wake, auto-speak, permissions and devices are deliberately untouched.
      await libraryRepository.save(useLibraryStore.getState().data)
    },
  }
}
let cached: { identity: string; url: string; client: ConfigHandoff } | undefined
export function desktopConfigHandoff(config: SyncConfig) {
  if (!('__TAURI_INTERNALS__' in window) || !isDeviceSyncActive(config)) return undefined
  const identity = `${config.space}/${config.device}`
  if (!cached || cached.identity !== identity || cached.url !== config.url) {
    cached?.client.close()
    cached = {
      identity,
      url: config.url,
      client: new ConfigHandoff(config, transport, nativeFor(config), () =>
        isDeviceSyncActive(config),
      ),
    }
  }
  return cached.client
}
export async function stopDesktopConfigHandoff() {
  cached?.client.close()
  cached = undefined
  if ('__TAURI_INTERNALS__' in window) await run('revoke-all')
}
