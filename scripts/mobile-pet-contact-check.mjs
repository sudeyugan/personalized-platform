// Real production Canvas, disposable context, no user files/permissions/model requests.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, sep, extname } from 'node:path'
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const { chromium } = require('playwright-core')
const root = resolve('apps/mobile/dist'), output = resolve('.inputs/mobile-pet-contacts')
await mkdir(output, { recursive: true })
const server = createServer(async (request, response) => {
  const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname)
  if (!path.startsWith(root + sep)) return response.writeHead(403).end()
  try {
    response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[extname(path)] ?? 'application/octet-stream')
    response.end(await readFile(path))
  } catch { response.writeHead(404).end() }
})
let browser
try {
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, executablePath: process.env.YIYU_UI_BROWSER_PATH })
  const context = await browser.newContext({ viewport: { width: 192, height: 256 }, deviceScaleFactor: 2 })
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  const page = await context.newPage()
  await page.goto(origin + '/pet.html')
  await page.waitForFunction(() => window.yiyuPetState && document.querySelector('canvas')?.dataset.frame)
  const state = { style: 'figurine', motion: true, resting: false, visible: true, phase: 'idle', pose: 'float' }
  const setState = async changes => {
    Object.assign(state, changes)
    await page.evaluate(value => window.yiyuPetState(value), state)
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
  }
  await setState({})
  const alpha = await page.locator('canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let ink = 0, clear = 0
    for (let i = 3; i < data.length; i += 4) { if (data[i] > 160) ink++; if (data[i] === 0) clear++ }
    return { ink, clear }
  })
  assert.ok(alpha.ink > 100 && alpha.clear > alpha.ink)
  await page.evaluate(() => window.yiyuPetAction('lift'))
  await page.screenshot({ path: resolve(output, 'lift.png'), omitBackground: true })
  await setState({ pose: 'perch' })
  await page.evaluate(() => { window.yiyuPetAction('sit'); window.yiyuPetContact(true) })
  await page.getByLabel('松手坐下').waitFor()
  const support = await page.getByLabel('松手坐下').boundingBox()
  assert.ok(Math.abs(support.y - 165) < 2)
  await page.screenshot({ path: resolve(output, 'contact-seat.png'), omitBackground: true })
  await page.evaluate(() => window.yiyuPetContact(false))
  await page.getByLabel('松手坐下').waitFor({ state: 'hidden' })
  await setState({ pose: 'right-edge' })
  await page.evaluate(() => window.yiyuPetAction('edge'))
  await page.screenshot({ path: resolve(output, 'edge.png'), omitBackground: true })
  await page.evaluate(() => window.yiyuPetGreeting())
  await page.screenshot({ path: resolve(output, 'greeting.png'), omitBackground: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
  const reduced = await page.locator('canvas').evaluate(canvas => canvas.toDataURL())
  await page.waitForTimeout(180)
  assert.equal(await page.locator('canvas').evaluate(canvas => canvas.toDataURL()), reduced)
  await setState({ pose: 'perch', motion: false })
  const first = await page.locator('canvas').evaluate(canvas => canvas.toDataURL())
  await page.waitForTimeout(180)
  assert.equal(await page.locator('canvas').evaluate(canvas => canvas.toDataURL()), first)
  await setState({ visible: false })
  assert.equal(await page.locator('canvas').count(), 0)
  await context.close()
  console.log('YIYU_PET_CONTACT_CANVAS_OK: actual alpha/contact marker/lift/edge/greeting/reduced motion/hidden states')
} finally { await browser?.close(); await new Promise(done => server.close(done)) }
