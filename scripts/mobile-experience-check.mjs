// Production assets, disposable browser context and invented records only.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, extname, sep } from 'node:path'
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const { chromium } = require('playwright-core')
const root = resolve('apps/mobile/dist'),
  output = resolve('.inputs/mobile-experience')
await mkdir(output, { recursive: true })
const server = createServer(async (request, response) => {
  const path = resolve(
    root,
    '.' + new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'),
  )
  if (!path.startsWith(root + sep)) {
    response.writeHead(403).end()
    return
  }
  try {
    const bytes = await readFile(path)
    response.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      }[extname(path)] ?? 'application/octet-stream',
    )
    response.end(bytes)
  } catch {
    response.writeHead(404).end()
  }
})
let browser
try {
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    ...(process.env.YIYU_UI_BROWSER_PATH
      ? { executablePath: process.env.YIYU_UI_BROWSER_PATH }
      : { channel: 'msedge' }),
  })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  )
  await context.addInitScript(() => {
    window.YiyuMobile = {
      showPet() {},
      hidePet() {},
      saveApiKey() {
        return true
      },
      configurePet() {
        return true
      },
      chatWithContext(id) {
        setTimeout(
          () =>
            dispatchEvent(
              new CustomEvent('yiyu-chat-result', {
                detail: { id, success: true, content: '虚构的本机测试回复。' },
              }),
            ),
          30,
        )
      },
      voiceReady() {},
      startVoice() {
        dispatchEvent(
          new CustomEvent('yiyu-voice', {
            detail: { phase: 'listening', session: 'fixture-voice', note: '' },
          }),
        )
      },
      stopVoice() {
        dispatchEvent(
          new CustomEvent('yiyu-voice', {
            detail: { phase: 'idle', session: 'fixture-voice', note: '已结束' },
          }),
        )
      },
      voiceConfigured() {
        return true
      },
      ideaRound(id) {
        const count = Number(sessionStorage.getItem('fixture.round') ?? 0) + 1
        sessionStorage.setItem('fixture.round', String(count))
        const frame = {
          version: 1,
          title: '把时间留给重要的事',
          reflection: `虚构第${count}轮：先看清真正想改变的部分。`,
          question: '你更想先从哪里开始？',
          options: ['先留下半小时', '减少不必要的安排', '明确最重要的目标'],
          manuscript: `第${count}轮的暂定整理，保留尚未确定的地方。`,
          uncertainties: ['时间安排还需要尝试'],
          nextStep: '先做一次小尝试。',
        }
        setTimeout(
          () =>
            dispatchEvent(
              new CustomEvent('yiyu-chat-result', {
                detail: { id, success: true, content: JSON.stringify(frame) },
              }),
            ),
          50,
        )
      },
    }
  })
  const page = await context.newPage(),
    errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto(origin)
  await page.getByRole('heading', { name: '今天，从容一点。' }).waitFor()
  const records = {
    'courses/c1': { id: 'c1', title: '数据结构', day: 1, period: 1, teacher: '虚构老师', location: '东楼101', weeks: '1-16 单周', note: '' },
    'courses/c2': { id: 'c2', title: '算法讨论', day: 1, period: 1, teacher: '虚构老师', location: '东楼102', weeks: '1-16 双周', note: '' },
    'people/p1': {
      id: 'p1',
      name: '不应在手机出现的人物',
      summary: '隐藏关键词',
      customFields: [{ id: 'old', label: '保留', value: '资料' }],
    },
    'chapters/c1': {
      id: 'c1',
      workId: 'w1',
      title: '隐藏关键词',
      plainText: '不能从手机搜索露出',
      summary: '',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    },
    'experiences/e1': { id: 'e1', title: '隐藏关键词' },
    'diary/2026-10-18': {
      date: '2026-10-18',
      title: '读书的一天',
      content: '窗外是远山。',
      updatedAt: '2026-10-18T00:00:00Z',
    },
  }
  const read = () =>
    page.evaluate(
      () =>
        new Promise((done, reject) => {
          const open = indexedDB.open('yiyu-mobile-library-v1', 1)
          open.onerror = reject
          open.onsuccess = () => {
            const db = open.result,
              tx = db.transaction('records', 'readonly'),
              request = tx.objectStore('records').get('current')
            tx.oncomplete = () => {
              db.close()
              done(request.result)
            }
          }
        }),
    )
  await page.evaluate(
    (records) =>
      new Promise((done, reject) => {
        const open = indexedDB.open('yiyu-mobile-library-v1', 1)
        open.onerror = reject
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('records', 'readwrite')
          tx.objectStore('records').put(records, 'current')
          tx.oncomplete = () => {
            db.close()
            done()
          }
        }
      }),
    records,
  )
  await page.reload()
  await page.getByRole('button', { name: '展开功能索引' }).waitFor()
  assert.equal(await page.locator('.bottom-navigation').count(), 0)
  const open = async (label) => {
    await page.getByRole('button', { name: '展开功能索引' }).click()
    await page.getByRole('dialog', { name: '功能索引' }).getByRole('button', { name: new RegExp(label) }).click()
  }
  await page.screenshot({ path: resolve(output, 'folio-home.png'), fullPage: true })
  await open('课表')
  assert.equal(await page.getByRole('table').getByRole('row').count(), 7)
  assert.equal(await page.getByRole('button', { name: /周一第1节/ }).count(), 2)
  await page.getByRole('combobox', { name: '课表教学周' }).selectOption('2')
  assert.equal(await page.getByRole('button', { name: /周一第1节 数据结构/ }).count(), 0)
  await page.getByRole('combobox', { name: '课表教学周' }).selectOption('')
  await page.screenshot({ path: resolve(output, 'folio-courses.png'), fullPage: true })
  await open('回到日常画布')
  const scrollPosition = await page.locator('main.page-content').evaluate(element => { element.scrollTop = Math.min(200, element.scrollHeight - element.clientHeight); return element.scrollTop })
  await open('课表')
  await open('回到日常画布')
  await page.waitForFunction(value => document.querySelector('main.page-content')?.scrollTop === value, scrollPosition)
  await page.getByRole('button', { name: '搜索手机记录' }).click()
  await page.getByLabel('搜索关键词').fill('隐藏关键词')
  await page.getByText('本机手机记录里还没有找到。').waitFor()
  await page.getByRole('button', { name: '搜索手机记录' }).click()
  await page.getByRole('button', { name: '管理待办' }).click()
  await page.getByLabel('想做什么').fill('手机里的日常待办')
  await page.getByLabel('重复', { exact: true }).selectOption('daily')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByText('手机里的日常待办', { exact: true }).waitFor()
  // Completing a home-canvas todo intentionally removes it from the pending view.
  await page.getByRole('checkbox', { name: '完成待办' }).click()
  await page.getByText('手机里的日常待办', { exact: true }).waitFor({ state: 'hidden' })
  await open('日记')
  await page.getByRole('button', { name: /读书的一天/ }).click()
  await page.getByRole('heading', { name: '读书的一天' }).waitFor()
  await page.getByRole('button', { name: '接着写', exact: true }).click()
  await page.getByLabel('这一天').fill('窗外是远山。手机续写，不改变旧资料。')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByText('窗外是远山。手机续写，不改变旧资料。', { exact: true }).waitFor()
  await open('心情与回望')
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: '开心 ' + i + '点', exact: true }).click()
  await page.getByRole('button', { name: '记下五点', exact: true }).click()
  await page.getByRole('button', { name: '色带', exact: true }).click()
  assert.ok(await page.locator('.mood-ribbons .mood-blend-bar').count())
  await page.screenshot({
    path: resolve(output, 'moods-light.png'),
    fullPage: true,
  })
  await open('想法工坊')
  await page.getByLabel('写下最初的念头').fill('想把时间留给重要的事')
  await page.getByRole('button', { name: /从这一念开始/ }).click()
  await page.getByRole('button', { name: '方向1：先留下半小时' }).click()
  await page.locator('[data-turn-id]').nth(1).waitFor()
  assert.equal(await page.locator('[data-turn-id]').count(), 2)
  await page.screenshot({
    path: resolve(output, 'ideas-light.png'),
    fullPage: true,
  })
  await open('和小鱼说话')
  assert.equal(await page.locator('.companion-stage').count(), 0, 'character must not be embedded in the app page')
  await page.getByRole('button', { name: '也可以写下来' }).click()
  await page.getByLabel('给小鱼的话').fill('这是普通会话的测试问候')
  await page.getByRole('button', { name: '发送给小鱼', exact: true }).click()
  await page.getByText('虚构的本机测试回复。', { exact: true }).waitFor()
  const shared = await read()
  assert.equal(Object.keys(shared).filter((key) => key.startsWith('chat/')).length, 2)
  await page.getByRole('button', { name: '普通会话', exact: true }).click()
  await page.getByText('虚构的本机测试回复。', { exact: true }).waitFor({ state: 'hidden' })
  await page.getByLabel('给小鱼的话').fill('这句只留在手机')
  await page.getByRole('button', { name: '发送给小鱼', exact: true }).click()
  await page.getByText('虚构的本机测试回复。', { exact: true }).waitFor()
  assert.equal(Object.keys(await read()).filter((key) => key.startsWith('chat/')).length, 2)
  await page.reload()
  await page.getByText('这句只留在手机', { exact: true }).waitFor()
  await page.getByRole('button', { name: '和小鱼说话', exact: true }).click()
  await page.getByRole('button', { name: '结束语音', exact: true }).waitFor()
  await page.getByRole('button', { name: '结束语音', exact: true }).click()
  await page.getByText('已结束', { exact: true }).waitFor()
  await page.screenshot({
    path: resolve(output, 'companion-light.png'),
    fullPage: true,
  })
  for (const [width, height, colorScheme] of [
    [320, 740, 'dark'],
    [844, 390, 'light'],
    [390, 844, 'light'],
    [400, 869, 'light'], // 1200×2608 physical pixels at DPR≈3; actual phone density remains device-controlled.
    [1200, 2608, 'light'],
  ]) {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    for (const tab of ['回到日常画布', '日记', '和小鱼说话', '课表', '日程', '待办', '作业', '心情与回望']) {
      await open(tab)
      assert.ok(
        (await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )) <= 1,
        tab + ' layout overflow',
      )
      const frame = await page.locator('.mobile-app').boundingBox()
      assert.ok(Math.abs(frame.width - width) <= 1, tab + ' must use the full viewport width')
      assert.ok(Math.abs(frame.height - height) <= 1, tab + ' must use the full viewport height')
      const body = await page.locator('main.page-content').boundingBox(), foot = await page.locator('.folio-foot').boundingBox()
      assert.ok(foot.y >= body.y + body.height - 1, 'bookmark footer must not obscure page content')
    }
    await page.getByRole('button', { name: '连接与设置', exact: true }).click()
    assert.ok(
      (await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )) <= 1,
      'settings layout overflow',
    )
    await page.screenshot({
      path: resolve(output, 'settings-' + width + '-' + colorScheme + '.png'),
      fullPage: true,
    })
  }
  const saved = await read()
  for (const key of ['people/p1', 'chapters/c1', 'experiences/e1'])
    assert.deepEqual(saved[key], records[key])
  assert.ok(
    Object.values(saved).find((value) => value.title === '手机里的日常待办').completedDates
      .length === 1,
  )
  const pet = await context.newPage()
  pet.on('pageerror', (error) => errors.push(error.message))
  await pet.setViewportSize({ width: 192, height: 256 })
  await pet.goto(origin + '/pet.html')
  await pet.waitForFunction(() => typeof window.yiyuPetState === 'function')
  for (const phase of ['idle', 'listening', 'thinking', 'speaking', 'error']) {
    await pet.evaluate(
      (phase) =>
        window.yiyuPetState({
          style: 'figurine',
          motion: false,
          resting: false,
          visible: true,
          phase,
        }),
      phase,
    )
    await pet.waitForFunction(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas?.width) return false
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
      let foreground = 0,
        transparent = 0
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] > 160) foreground++
        if (pixels[i] === 0) transparent++
      }
      return foreground > 1000 && transparent > 1000
    })
    await pet.screenshot({
      path: resolve(output, 'pet-' + phase + '.png'),
      omitBackground: true,
    })
  }
  await pet.evaluate(() => window.yiyuPetState({ style: 'figurine', pose: 'perch', motion: false, resting: false, visible: true, phase: 'idle' }))
  await pet.waitForFunction(() => document.querySelector('canvas')?.dataset.frame === '5')
  await pet.screenshot({ path: resolve(output, 'pet-seated.png'), omitBackground: true })
  await pet.evaluate(() =>
    window.yiyuPetState({
      style: 'mark',
      motion: false,
      resting: false,
      visible: true,
      phase: 'listening',
    }),
  )
  await pet.locator('.ink-mark').waitFor()
  await pet.evaluate(() =>
    window.yiyuPetState({
      style: 'mark',
      motion: false,
      resting: false,
      visible: false,
      phase: 'idle',
    }),
  )
  await pet.locator('.mobile-overlay').waitFor({ state: 'hidden' })
  assert.deepEqual(errors, [])
  console.log(
    'YIYU_MOBILE_EXPERIENCE_OK: folio index, no embedded character, seven-module routes/no hidden PC search, date-based diary/todo/moods/ideas, private/shared chat reload, voice fixture, transparent companion/mark/hidden, full-width 320/390/400/844/1200 layouts. No real account, microphone or model used.',
  )
} finally {
  await browser?.close()
  await new Promise((done) => server.close(done))
}
