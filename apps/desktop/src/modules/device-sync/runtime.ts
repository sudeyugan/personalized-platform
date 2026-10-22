import { create } from 'zustand'
import { connect, conflicts, invite, loadState, readPairing, recover, saveEnrollment, saveState, SyncClient, type SyncState } from '@yiyu/sync'
import { libraryRepository } from '../../infrastructure/libraryRepository'
import { useLibraryStore } from '../../state/useLibraryStore'
import { mergeLibrary, projectLibrary } from './libraryProjection'
import { desktopConfigHandoff, stopDesktopConfigHandoff } from './config/nativeAdapter'
import type { SyncConfig } from '@yiyu/sync'
import { transport } from './transport'

export { transport }
interface DeviceSyncView { state: SyncState | null; busy: boolean; error: string; configError?: string; lastSync?: string }
export const useDeviceSync = create<DeviceSyncView>(() => ({ state: null, busy: false, error: '' }))
let client: SyncClient | null = null
let started: Promise<void> | undefined
let inFlight: Promise<void> | undefined
let paused = false
let captureTimer: ReturnType<typeof setTimeout> | undefined
const fail = (error: unknown) => { useDeviceSync.setState({ error: error instanceof Error ? error.message : '同步暂不可用；本机资料保留。' }) }
const libraryScope = () => useLibraryStore.getState().health?.libraryPath ?? 'browser-preview'
export function isDeviceSyncActive(config: SyncConfig) {
  return !!client && !paused && client.state.config.device === config.device && client.state.config.space === config.space && client.state.config.url === config.url && config.libraryScope === libraryScope()
}
function install(state: SyncState) {
  client = new SyncClient(state, {
    read: () => projectLibrary(libraryRepository.committedData ?? useLibraryStore.getState().data),
    persist: async value => { await saveState(value); useDeviceSync.setState({ state: value }) },
    transport,
    apply: async records => {
      const store = useLibraryStore.getState()
      const focused = document.activeElement?.matches('input,textarea,[contenteditable="true"]')
      if (focused || store.saveStatus === 'saving' || store.saveStatus === 'error') return false
      // Capture jobs queued while a request was in flight must run first.
      if (JSON.stringify(projectLibrary(store.data)) !== JSON.stringify(client?.state.baseline)) return false
      const data = mergeLibrary(store.data, records)
      if (JSON.stringify(data) === JSON.stringify(store.data)) return true
      useLibraryStore.setState({ data, saveStatus: 'saving' })
      try {
        await libraryRepository.save(data, 'sync')
        if (useLibraryStore.getState().data === data) useLibraryStore.setState({ saveStatus: 'saved' })
        return true
      } catch (error) { useLibraryStore.setState({ saveStatus: 'error' }); throw error }
    },
  })
  useDeviceSync.setState({ state })
}
export function startDeviceSync() {
  if (started) return started
  started = (async () => {
    const state = await loadState()
    if (state && state.config.libraryScope !== libraryScope()) {
      useDeviceSync.setState({ state, error: '本机资料库位置已变化，已停止同步，避免把另一份资料传入原中枢。请先保留恢复包，再断开并重新连接。' })
    } else if (state) install(state)
    libraryRepository.onCommitted(data => {
      if (!client || paused) return
      clearTimeout(captureTimer)
      captureTimer = setTimeout(() => { if (client && !paused) void client.capture(projectLibrary(data)).catch(fail) }, 2000)
    })
  })().catch(fail)
  return started
}
export async function syncNow() {
  if (inFlight || !client || paused) return inFlight
  useDeviceSync.setState({ busy: true, error: '' })
  inFlight = client.sync().then(async () => {
    useDeviceSync.setState({ lastSync: new Date().toISOString() })
    if (client) {
      try { await desktopConfigHandoff(client.state.config)?.tick(); useDeviceSync.setState({ configError: '' }) }
      catch { useDeviceSync.setState({ configError: '资料已同步；配置交接暂未完成，请在配置交接中检查，并确认中枢已更新。' }) }
    }
  }).catch(fail).finally(() => { inFlight = undefined; useDeviceSync.setState({ busy: false }) })
  return inFlight
}
export async function joinDevice(raw: string, name: string, url?: string) {
  if (client) throw new Error('本机已连接中枢；请勿重复加入。')
  const isRecovery = !url && typeof JSON.parse(raw)?.recovery === 'string'
  const pairing = url || isRecovery ? undefined : readPairing(raw)
  const state = isRecovery ? await recover(raw, name, transport) : await connect(url ?? pairing!.url, pairing?.invite ?? raw.trim(), name, transport, pairing)
  if (url) state.config.recovery = raw.trim()
  state.config.libraryScope = libraryScope()
  // Local save can fail: do not start networking without durable device state.
  await saveState(state)
  await saveEnrollment(null)
  install(state)
  await syncNow()
}
export async function createDeviceInvite() {
  if (!client) throw new Error('请先连接中枢。')
  return invite(client.state, transport)
}
export async function resolveConflict(key: string, id: string) {
  if (!client) return
  await client.resolve(key, id)
  await syncNow()
}
export async function disconnectDevice() {
  paused = true
  clearTimeout(captureTimer)
  try {
    await stopDesktopConfigHandoff()
    await inFlight
    await client?.idle()
    await saveState(null)
    client = null
    useDeviceSync.setState({ state: null, error: '', lastSync: undefined })
  } finally { paused = false }
}
export function conflictKeys() { return client ? conflicts(client.state) : [] }
export async function moveDeviceHub(url: string) {
  if (!client || paused) throw new Error('请先连接原中枢。')
  paused = true
  useDeviceSync.setState({ busy: true, error: '' })
  try { await inFlight; await client.moveEndpoint(url) }
  finally { paused = false; useDeviceSync.setState({ busy: false }) }
  await syncNow()
}
