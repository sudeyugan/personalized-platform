// Isolated local fixture: two real Edge contexts, no real accounts/model calls.
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { HubStore } from '../apps/sync-hub/src/store.mjs'
import { createHubServer } from '../apps/sync-hub/src/server.mjs'
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const { chromium } = require('playwright-core')
const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')
const temporary = await mkdtemp(join(tmpdir(), 'yiyu-sync-ui-'))
const output = resolve('.inputs/device-sync-ui'); await mkdir(output, { recursive: true })
const store = new HubStore(join(temporary, 'hub.sqlite')), credential = store.initialize(), hub = createHubServer(store)
const children = []
let browser
try {
  await new Promise(done => hub.listen(0, '127.0.0.1', done))
  const hubUrl = `http://127.0.0.1:${hub.address().port}`
  for (const [app, port] of [['desktop', 1420], ['mobile', 1421]]) {
    const child = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: resolve(`apps/${app}`), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: undefined } })
    children.push(child)
    await new Promise((done, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Preview ${app} timed out`)), 20000)
      child.once('error', reject); child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview ${app} exited ${code}`)) })
      child.stdout.on('data', chunk => { if (chunk.toString().includes('127.0.0.1')) { clearTimeout(timeout); done() } })
    })
  }
  browser = await chromium.launch({ channel: 'msedge', headless: true, chromiumSandbox: true })
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 960 } })
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  // Recent Edge gates loopback subresources of route-fulfilled documents. Grant
  // only this disposable test origin; no daily profile/policy/security flags.
  await desktopContext.grantPermissions(['local-network-access'], { origin: 'http://127.0.0.1:1420' })
  await mobileContext.grantPermissions(['local-network-access'], { origin: 'http://127.0.0.1:1421' })
  for (const context of [desktopContext, mobileContext]) await context.route('**/*', route => ['http://127.0.0.1:1420', 'http://127.0.0.1:1421', hubUrl].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort())
  const desktop = await desktopContext.newPage(), mobile = await mobileContext.newPage(), errors = []
  const pending = new Set()
  desktop.on('request', request => pending.add(new URL(request.url()).pathname))
  desktop.on('requestfinished', request => pending.delete(new URL(request.url()).pathname))
  desktop.on('requestfailed', request => pending.delete(new URL(request.url()).pathname))
  for (const page of [desktop, mobile]) page.on('pageerror', error => errors.push(error.message))
  desktop.on('console', message => { if (message.type() === 'error') console.error('Fixture console:', message.text().slice(0, 500)) })
  await desktop.goto('http://127.0.0.1:1420/', { waitUntil: 'domcontentloaded' })
  await desktop.waitForFunction(() => localStorage.getItem('yiyu.library.preview.v1'))
  await desktop.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('yiyu.library.preview.v1'))
    saved.data.session.activeView = 'settings'
    saved.data.planner.todos = [{ id: 'fixture-task', title: '双端同步测试', note: '虚构资料', priority: 'medium', completed: false, createdAt: '2026-10-18' }]
    localStorage.setItem('yiyu.library.preview.v1', JSON.stringify(saved))
    localStorage.setItem('yiyu.settings.activeTab', 'data')
  })
  await desktop.reload({ waitUntil: 'domcontentloaded' })
  await desktop.getByLabel('这是中枢的第一台设备').check()
  await desktop.getByLabel('中枢地址', { exact: true }).fill(hubUrl)
  await desktop.getByLabel('连接凭证').fill(credential)
  await desktop.getByRole('button', { name: '连接私人中枢' }).click()
  await desktop.getByRole('button', { name: '邀请另一台设备' }).waitFor()
  await desktop.getByRole('button', { name: '邀请另一台设备' }).click()
  const invitation = await desktop.getByLabel('设备邀请', { exact: true }).inputValue()
  await mobile.goto('http://127.0.0.1:1421/')
  await mobile.getByRole('button', { name: '连接', exact: true }).click()
  await mobile.getByRole('textbox', { name: /在电脑/ }).fill(invitation)
  await mobile.getByRole('button', { name: '连接我的中枢' }).click()
  await mobile.getByText('已连接 · 我的手机').waitFor()
  await mobile.getByRole('button', { name: '今日', exact: true }).click()
  await mobile.getByRole('heading', { name: '双端同步测试' }).waitFor()
  await mobile.getByRole('checkbox', { name: '完成待办' }).check()
  await mobile.getByRole('button', { name: '同步', exact: true }).click()
  await mobile.getByRole('button', { name: '同步', exact: true }).waitFor()
  await mobile.reload()
  await mobile.getByRole('checkbox', { name: '完成待办' }).waitFor()
  assert.equal(await mobile.getByRole('checkbox', { name: '完成待办' }).isChecked(), true)
  await desktop.getByRole('button', { name: '现在同步', exact: true }).click()
  await desktop.waitForFunction(() => JSON.parse(localStorage.getItem('yiyu.library.preview.v1')).data.planner.todos.find(item => item.id === 'fixture-task')?.completed === true)
  await mobile.screenshot({ path: join(output, 'mobile-light.png'), fullPage: true })
  await mobile.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await mobile.screenshot({ path: join(output, 'mobile-dark.png'), fullPage: true })
  await desktop.screenshot({ path: join(output, 'desktop-settings.png'), fullPage: true })
  assert.deepEqual(errors, [])
  console.log('YIYU_SYNC_UI_OK: isolated Edge enrollment, invitation, desktop→mobile, mobile→desktop, reload and light/dark checks passed')
} finally {
  await browser?.close()
  for (const child of children) { child.kill(); await new Promise(done => child.exitCode !== null ? done() : child.once('exit', done)) }
  await new Promise(done => hub.close(done)); store.close()
  await rm(temporary, { recursive: true })
}
