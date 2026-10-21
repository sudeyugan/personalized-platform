// Disposable browser profile + local hub only. Never use a daily profile or real credentials.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { HubStore } from '../apps/sync-hub/src/store.mjs'
import { createHubServer } from '../apps/sync-hub/src/server.mjs'

const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const { chromium } = require('playwright-core')
const temporary = await mkdtemp(join(tmpdir(), 'yiyu-sync-settings-'))
const output = resolve('.inputs/sync-settings-ui')
await mkdir(output, { recursive: true })
const store = new HubStore(join(temporary, 'hub.sqlite'))
const credential = store.initialize()
const hub = createHubServer(store)
let browser, preview
try {
  await new Promise((done, reject) => { hub.once('error', reject); hub.listen(0, '127.0.0.1', done) })
  const hubUrl = `http://127.0.0.1:${hub.address().port}`
  // Serve the production build without changing either app's runtime or storage.
  const { preview: serve } = await import(require.resolve('vite'))
  preview = await serve({ root: resolve('apps/desktop'), preview: { host: '127.0.0.1', port: 1420, strictPort: true } })
  const origin = `http://127.0.0.1:${preview.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    ...(process.env.YIYU_UI_BROWSER_PATH ? { executablePath: process.env.YIYU_UI_BROWSER_PATH } : { channel: 'msedge' }) })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
  await context.route('**/*', route => [origin, hubUrl].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort())
  await context.grantPermissions(['local-network-access'], { origin })
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin)
  await page.waitForFunction(() => localStorage.getItem('yiyu.library.preview.v1'))
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('yiyu.library.preview.v1'))
    saved.data.session.activeView = 'settings'
    localStorage.setItem('yiyu.library.preview.v1', JSON.stringify(saved))
    localStorage.setItem('yiyu.settings.activeTab', 'data')
  })
  await page.reload()
  const panel = page.locator('.device-sync')
  await panel.getByRole('heading', { name: '让一隅，随你同行' }).waitFor()
  assert.equal(await panel.getByRole('button', { name: '连接私人中枢' }).isDisabled(), true)
  await panel.getByLabel('设备名称', { exact: true }).fill('界面测试电脑')
  const overflow = () => panel.evaluate(element => {
    const box = element.getBoundingClientRect()
    return [...element.querySelectorAll('input, textarea, button, summary')].filter(child => {
      const rect = child.getBoundingClientRect()
      return rect.width && (rect.left < box.left - 1 || rect.right > box.right + 1)
    }).map(child => child.tagName)
  })
  const snapshot = async (name, width, theme) => {
    await page.setViewportSize({ width, height: 1080 })
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
    assert.deepEqual(await overflow(), [], `${name}: controls overflow`)
    await panel.screenshot({ path: join(output, `${name}.png`) })
  }
  await snapshot('invite-warm-1440', 1440, 'warm')
  await snapshot('invite-light-960', 960, 'light')
  await snapshot('invite-dark-650', 650, 'dark')
  await panel.getByLabel('这是中枢的第一台设备').check()
  await panel.getByLabel('中枢地址', { exact: true }).fill(hubUrl)
  await snapshot('first-device-warm-1440', 1440, 'warm')
  await snapshot('first-device-dark-390', 390, 'dark')
  await panel.getByLabel('连接凭证', { exact: true }).fill(credential)
  await panel.getByRole('button', { name: '连接私人中枢' }).click()
  await panel.getByRole('button', { name: '现在同步', exact: true }).waitFor()
  await panel.getByRole('button', { name: '设备列表', exact: true }).click()
  await panel.getByRole('heading', { name: '已配对设备' }).waitFor()
  await panel.getByRole('button', { name: '邀请另一台设备' }).click()
  assert.ok((await panel.getByLabel('设备邀请', { exact: true }).inputValue()).length)
  await panel.getByRole('button', { name: '收起邀请' }).click()
  await snapshot('connected-warm-1440', 1440, 'warm')
  await snapshot('connected-light-960', 960, 'light')
  await snapshot('connected-dark-390', 390, 'dark')
  await snapshot('connected-dark-320', 320, 'dark')
  await panel.getByText('迁移到云中枢地址', { exact: true }).click()
  await panel.getByRole('textbox', { name: '新中枢 HTTPS 地址' }).fill(`https://${'long-address-'.repeat(6)}example.com`)
  await panel.getByText('恢复与连接管理', { exact: true }).click()
  await snapshot('management-dark-320', 320, 'dark')
  assert.deepEqual(errors, [])
  console.log('YIYU_SYNC_SETTINGS_UI_OK: enrollment/invitation/devices/folds and warm/light/dark 1440/960/650/390/320 layouts; no user data or external requests')
} finally {
  await browser?.close()
  await preview?.close()
  await new Promise(done => hub.close(done))
  store.close()
  await rm(temporary, { recursive: true })
}
