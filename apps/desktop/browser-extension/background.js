import { authorisedSites, bridgeCall } from './policy.js'
import { readJob } from './readers.js'
import { maintainConnection } from './maintenance.js'
import { EXTENSION_REVISION } from './revision.js'
import { browserFailureCode } from './failure.js'
import { registerTrustedLoginBridge } from './trusted-login.js'
import { maintainRecording, clearRecording, handleRecordingMessage } from './recording.js'
import { maintainQueryWindow } from './query-window.js'

registerTrustedLoginBridge()

let pumping = false, timer
async function pump() {
  if (pumping) return
  pumping = true
  try {
    const { connectionCode } = await chrome.storage.local.get('connectionCode')
    if (!connectionCode) { await clearRecording(); await maintainQueryWindow(null); return }
    const response = await bridgeCall('/poll', { sites: await authorisedSites(), version:chrome.runtime.getManifest().version, revision:EXTENSION_REVISION }, connectionCode)
    if(!response.maintenance){await clearRecording();await maintainQueryWindow(null);chrome.action.setBadgeText({text:'更'});await chrome.storage.local.set({connectionError:'一隅版本不支持自动维护，请更新桌面运行版'});return}
    const maintenance = await maintainConnection(response.maintenance, Boolean(response.job))
    if (maintenance.stop) { await clearRecording(); await maintainQueryWindow(null); chrome.action.setBadgeText({ text:'更' }); await chrome.storage.local.set({ connectionError:maintenance.error }); return }
    await maintainQueryWindow(response.maintenance,Boolean(response.job))
    chrome.action.setBadgeText({ text: '·' }); chrome.action.setBadgeBackgroundColor({ color: '#62828b' })
    await maintainRecording(response.recording)
    if (response.job) {
      chrome.action.setBadgeText({ text: '读' })
      let reply
      try { reply = { id: response.job.id, ok: true, data: await readJob(response.job, async job => { const active = await bridgeCall('/active', { id:job.id }, connectionCode); if (active.active !== true) throw new Error('permission') }) } }
      catch (error) { reply = { id: response.job.id, ok: false, error: browserFailureCode(error) } }
      await bridgeCall('/reply', reply, connectionCode)
    }
    await chrome.storage.local.set({ connectionError: '' })
    clearTimeout(timer); timer = setTimeout(() => void pump(), 3000)
  } catch { await clearRecording(); await maintainQueryWindow(null).catch(()=>undefined); chrome.action.setBadgeText({ text: '!' }); await chrome.storage.local.set({ connectionError: '一隅未启动、连接已停用或需要重新连接' }) }
  finally { pumping = false }
}
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
chrome.storage.session.setAccessLevel({ accessLevel:'TRUSTED_CONTEXTS' })
chrome.alarms.create('yiyu-connection', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'yiyu-connection') void pump() })
chrome.runtime.onStartup.addListener(() => void pump())
chrome.runtime.onInstalled.addListener(() => void pump())
chrome.permissions.onRemoved.addListener(() => void pump())
chrome.permissions.onAdded.addListener(() => void pump())
chrome.runtime.onMessage.addListener((message, sender, reply) => { if (handleRecordingMessage(message,sender,reply)) return true; if (sender.id === chrome.runtime.id && ['popup.html','setup.html'].some(path=>sender.url===chrome.runtime.getURL(path)) && message?.type === 'wake') { void pump(); reply({ ok: true }) } })
void pump()
