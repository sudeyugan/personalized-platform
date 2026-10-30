// Production build, isolated invented records, no real model/keys/device permission.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, extname, sep } from 'node:path'
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const { chromium } = require('playwright-core')
const root = resolve('apps/mobile/dist'), output = resolve('.inputs/mobile-tablet')
await mkdir(output, { recursive: true })
const server = createServer(async (request, response) => {
  const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'))
  if (!path.startsWith(root + sep)) return response.writeHead(403).end()
  try {
    response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[extname(path)] ?? 'application/octet-stream')
    response.end(await readFile(path))
  } catch { response.writeHead(404).end() }
})
let browser
try {
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, executablePath: process.env.YIYU_UI_BROWSER_PATH })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, hasTouch: true, isMobile: true })
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  const page = await context.newPage(), errors = []
  page.setDefaultTimeout(8000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  await page.goto(origin)
  await page.getByRole('heading', { name: '今天，从容一点。' }).waitFor()
  await page.evaluate(() => new Promise((done, reject) => {
    const request = indexedDB.open('yiyu-mobile-library-v1', 1)
    request.onerror = reject
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('records', 'readwrite')
      const date = new Date().toLocaleDateString('sv-SE')
      tx.objectStore('records').put({
        [`diary/${date}`]: { date, title: '平板上的一页', content: '大屏阅读也保留从容的行宽。', updatedAt: new Date().toISOString() },
        'courses/c1': { id: 'c1', title: '平板课表测试', day: 1, period: 1, teacher: '虚构', location: '东楼101', weeks: '1-16', note: '' },
        'calendar/c1': { id: 'c1', title: '上午讨论', date, time: '09:00', note: '本地虚构安排' },
        'calendar/c2': { id: 'c2', title: '下午整理', date, time: '15:00', note: '' },
        'todos/t1': { id: 't1', title: '平板待办', repeat: 'none', note: '虚构' },
      }, 'current')
      tx.oncomplete = () => { db.close(); done() }
      tx.onerror = reject
    }
  }))
  await page.reload()
  await page.getByRole('heading', { name: '今天，从容一点。' }).waitFor()
  const open = async label => {
    await page.getByRole('button', { name: '展开功能索引' }).click()
    await page.getByRole('dialog', { name: '功能索引' }).getByRole('button', { name: new RegExp(label) }).click()
  }
  const checkShell = async label => {
    const bounds = await page.evaluate(() => {
      const main = document.querySelector('.page-content'), app = document.querySelector('.mobile-app'), foot = document.querySelector('.folio-foot')
      const m = main.getBoundingClientRect(), a = app.getBoundingClientRect(), f = foot.getBoundingClientRect()
      return { width: innerWidth, height: innerHeight, appTop: a.top, appWidth: a.width, appHeight: a.height, overflow: main.scrollWidth - main.clientWidth, footerGap: f.top - m.bottom, footerVisible: !!document.elementFromPoint(f.x + f.width / 2, f.y + f.height / 2)?.closest('.folio-foot'), bodyOverflow: document.documentElement.scrollWidth - innerWidth }
    })
    assert.ok(Math.abs(bounds.appWidth - bounds.width) <= 1 && Math.abs(bounds.appHeight - bounds.height) <= 1, `${label}: full window ${JSON.stringify(bounds)}`)
    assert.ok(bounds.appTop >= -1 && bounds.footerVisible && bounds.overflow <= 2 && bounds.bodyOverflow <= 2 && bounds.footerGap >= -1, `${label}: no horizontal overflow or footer overlap ${JSON.stringify(bounds)}`)
  }
  const routes = ['回到日常画布', '课表', '日程', '待办', '作业', '日记', '心情与回望', '想法工坊', '和小鱼说话', '连接与设置']
  for (const [width, height] of [[1440, 960], [960, 1440], [1920, 1280], [1100, 760], [800, 900], [600, 820], [390, 844], [320, 740], [1440, 450]]) {
    await page.setViewportSize({ width, height })
    for (const label of routes) { await open(label); await checkShell(`${width}x${height} ${label}`) }
    console.log(`TABLET_LAYOUT_OK ${width}x${height}`)
  }
  await page.setViewportSize({ width: 1440, height: 960 })
  await open('日程')
  const month = await page.getByRole('region', { name: '月历' }).boundingBox(), agenda = await page.getByRole('region', { name: '当天日程' }).boundingBox()
  assert.ok(month.x + month.width < agenda.x && Math.abs(month.y - agenda.y) < 35, 'wide calendar is genuinely side by side')
  await page.screenshot({ path: resolve(output, 'calendar-wide.png') })
  await open('课表')
  assert.equal(await page.getByRole('table').getByRole('row').count(), 7)
  assert.ok(await page.locator('.schedule-course strong').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize)) >= 14)
  await page.screenshot({ path: resolve(output, 'courses-wide.png') })
  await open('日记')
  const index = await page.getByRole('complementary', { name: '日记索引' }).boundingBox(), article = await page.locator('.diary-open-page').boundingBox()
  assert.ok(index.x < article.x && article.width <= 760, 'diary has a left index and bounded reading width')
  await page.screenshot({ path: resolve(output, 'diary-wide.png') })
  await page.getByRole('button', { name: '接着写' }).click()
  await page.getByLabel('这一天', { exact: true }).fill('平板草稿跨窗口保留。')
  for (const [width, height] of [[600, 820], [960, 1440], [1440, 450], [1440, 960]]) {
    await page.setViewportSize({ width, height })
    assert.equal(await page.getByLabel('这一天', { exact: true }).inputValue(), '平板草稿跨窗口保留。')
    const dialog = await page.getByRole('dialog').boundingBox(), viewport = page.viewportSize()
    assert.ok(dialog.x >= 0 && dialog.y >= 0 && dialog.x + dialog.width <= viewport.width + 1 && dialog.y + dialog.height <= viewport.height + 1, 'editor fits current window')
  }
  // The textarea, not the header save button, is the final control in DOM order.
  await page.getByLabel('这一天', { exact: true }).focus()
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), '返回')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByText('平板草稿跨窗口保留。', { exact: true }).waitFor()
  await page.getByRole('button', { name: '收起大屏卷目' }).click()
  assert.equal(await page.getByRole('navigation', { name: '常用卷目' }).isVisible(), false)
  await page.getByRole('button', { name: '切换大屏卷目' }).click()
  assert.equal(await page.getByRole('navigation', { name: '常用卷目' }).isVisible(), true)
  await open('想法工坊')
  assert.equal(await page.getByRole('navigation', { name: '常用卷目' }).isVisible(), false)
  await page.getByLabel('写下最初的念头').fill('缩小窗口仍保留这一念')
  await page.setViewportSize({ width: 600, height: 820 })
  assert.equal(await page.getByLabel('写下最初的念头').inputValue(), '缩小窗口仍保留这一念')
  await page.setViewportSize({ width: 1440, height: 960 })
  await checkShell('ideas after composing and resize')
  await page.screenshot({ path: resolve(output, 'ideas-wide.png') })
  for (const mode of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' })
    await open('回到日常画布'); await checkShell(mode)
    await page.screenshot({ path: resolve(output, `home-${mode}.png`) })
  }
  assert.equal(errors.length, 0, errors.join('\n'))
  await context.close()
  console.log('YIYU_TABLET_UI_OK: 9 viewport sizes × 10 routes, actual split calendar/diary, larger timetable, resizable editor/draft/focus, collapsible margin and focused ideas, light/dark/reduced motion')
} finally { await browser?.close(); await new Promise(done => server.close(done)) }
