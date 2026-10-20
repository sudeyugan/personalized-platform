// Real local hub + actual production UI/protocol/IDB, but native crypto is a fixture.
// Native cryptography is covered separately by Rust/JCA tests; no real API key is used.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { HubStore } from '../apps/sync-hub/src/store.mjs'
import { createHubServer } from '../apps/sync-hub/src/server.mjs'
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const { chromium } = require('playwright-core')
const temporary = await mkdtemp(join(tmpdir(), 'yiyu-config-ui-'))
const output = resolve('.inputs/config-handoff-ui')
await mkdir(output, { recursive: true })
const store = new HubStore(join(temporary, 'hub.sqlite')),
  hub = createHubServer(store)
let browser, preview
try {
  await new Promise((done) => hub.listen(0, '127.0.0.1', done))
  const url = `http://127.0.0.1:${hub.address().port}`,
    key = randomBytes(32).toString('base64')
  const owner = store.enroll(store.initialize(), '已有手机'),
    invitation = store.invite(store.authenticate(owner.token)).invite
  const pairing = JSON.stringify({ v: 1, url, key, space: store.space, invite: invitation })
  preview = spawn(
    process.execPath,
    [
      join(dirname(require.resolve('vite/package.json')), 'bin/vite.js'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      '1421',
      '--strictPort',
    ],
    { cwd: resolve('apps/mobile'), stdio: ['ignore', 'pipe', 'pipe'] },
  )
  await new Promise((done, reject) => {
    const timeout = setTimeout(() => reject(new Error('preview startup')), 20000)
    preview.once('error', reject)
    preview.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('127.0.0.1')) {
        clearTimeout(timeout)
        done()
      }
    })
  })
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    ...(process.env.YIYU_UI_BROWSER_PATH
      ? { executablePath: process.env.YIYU_UI_BROWSER_PATH }
      : { channel: 'msedge' }),
  })
  const contexts = []
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    contexts.push(context)
    await context.grantPermissions(['local-network-access'], { origin: 'http://127.0.0.1:1421' })
    await context.route('**/*', (route) =>
      ['http://127.0.0.1:1421', url].includes(new URL(route.request().url()).origin)
        ? route.continue()
        : route.abort(),
    )
    await context.addInitScript(() => {
      sessionStorage.setItem('yiyu.mobile.page', 'settings')
      window.YiyuMobile = {
        configHandoff(operation, raw) {
          const input = JSON.parse(raw),
            config = { model: { model: 'deepseek-chat' } }
          let value
          if (operation === 'identity') value = 'A'.repeat(124)
          if (operation === 'state')
            value = JSON.parse(localStorage.getItem('fixture.native.state') ?? '{}')
          if (operation === 'available') value = { ...config, revision: 'fixture-only' }
          if (operation === 'authorize') {
            localStorage.setItem('fixture.native.grant', JSON.parse(input.context)[2])
            value = true
          }
          if (operation === 'revoke') {
            localStorage.removeItem('fixture.native.grant')
            value = true
          }
          if (operation === 'seal')
            value = { ephemeral: 'A'.repeat(124), iv: 'A'.repeat(16), body: 'A'.repeat(48) }
          if (operation === 'apply') {
            const bound = JSON.parse(input.context)
            localStorage.setItem(
              'fixture.native.state',
              JSON.stringify({ request: bound[2], sequence: bound[5] }),
            )
            value = config
          }
          if (operation === 'detach') {
            const state = JSON.parse(localStorage.getItem('fixture.native.state') ?? '{}')
            localStorage.setItem(
              'fixture.native.state',
              JSON.stringify({ ...state, detached: true }),
            )
            value = true
          }
          return JSON.stringify({ ok: true, value })
        },
        voiceConfigured() {
          return false
        },
        configurePet() {
          return true
        },
        voiceReady() {},
      }
    })
  }
  const source = await contexts[0].newPage(),
    target = await contexts[1].newPage()
  await source.goto('http://127.0.0.1:1421/')
  await source.evaluate(
    async ({ owner, url, key, space }) => {
      await new Promise((done, reject) => {
        const open = indexedDB.open('yiyu-device-sync-v1', 1)
        open.onupgradeneeded = () => open.result.createObjectStore('state')
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('state', 'readwrite')
          tx.objectStore('state').put(
            {
              v: 1,
              config: { ...owner, url, key, space, name: '已有手机' },
              cursor: 0,
              operations: [],
              pending: [],
              baseline: {},
              selected: {},
            },
            'current',
          )
          tx.oncomplete = () => {
            db.close()
            done()
          }
          tx.onerror = reject
        }
      })
    },
    { owner, url, key, space: store.space },
  )
  await source.reload()
  await source.getByText('已连接 · 已有手机').waitFor()
  await target.goto('http://127.0.0.1:1421/')
  await target.getByRole('textbox', { name: /在电脑/ }).fill(pairing)
  await target.getByRole('button', { name: '连接我的中枢' }).click()
  await target.getByText('等已有设备确认', { exact: true }).waitFor()
  const code = await target.locator('.config-receipt code').innerText()
  await source.getByRole('button', { name: '刷新交接状态' }).click()
  await source.getByText('我的手机 想沿用配置', { exact: true }).waitFor()
  const approve = source.getByRole('button', { name: '批准所选配置' })
  assert.equal(await approve.isDisabled(), true)
  await source.getByLabel('输入新设备显示的校验码').fill('0000 0000 0000')
  assert.equal(await approve.isDisabled(), true)
  await source.getByLabel('输入新设备显示的校验码').fill(code)
  await approve.click()
  await source.getByText('正在向 我的手机 提供配置', { exact: true }).waitFor()
  await target.getByRole('button', { name: '刷新交接状态' }).click()
  await target.getByText('正在沿用 · 自动接收后续更新', { exact: true }).waitFor()
  await target.screenshot({ path: join(output, 'received-light.png'), fullPage: true })
  await target.setViewportSize({ width: 320, height: 800 })
  await target.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  assert.equal(
    await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  )
  await target.screenshot({ path: join(output, 'received-dark-320.png'), fullPage: true })
  await target.getByRole('button', { name: '停止跟随，保留当前配置' }).click()
  await target.getByText('配置已保留 · 当前独立使用', { exact: true }).waitFor()
  await target.reload()
  await target.getByText('配置已保留 · 当前独立使用', { exact: true }).waitFor()
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM operations').get().n, 0)
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM config_channels').get().n, 0)
  console.log(
    'Config UI: pairing request, wrong-code refusal, approval, receipt, stop/reload and 320px dark layout passed; native fixture only',
  )
} finally {
  await browser?.close()
  preview?.kill()
  await new Promise((done) => hub.close(done))
  store.close()
  await rm(temporary, { recursive: true })
}
