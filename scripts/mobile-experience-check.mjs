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
      chat(id) {
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
  await page.getByRole('heading', { name: /生活有时很满/ }).waitFor()
  const records = {
    'works/w1': {
      id: 'w1',
      kind: 'custom',
      title: '虚构作品',
      description: '用于验证',
      chapterIds: ['c1'],
      volumeIds: [],
      targetWords: 0,
      createdAt: '2026-10-19T01:00:00Z',
      updatedAt: '2026-10-19T01:00:00Z',
    },
    'chapters/c1': {
      id: 'c1',
      workId: 'w1',
      title: '原始章节',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { textAlign: 'center', lineHeight: '2' },
            content: [
              {
                type: 'text',
                text: '原来的正文',
                marks: [
                  { type: 'entityReference', attrs: { entityType: 'person', entityId: 'p1', label: '人物' } },
                  { type: 'authorAnnotation', attrs: { id: 'a1', note: '保留批注', createdAt: 'then' } },
                ],
              },
            ],
          },
          {
            type: 'imageAsset',
            attrs: {
              assetId: 'asset-original',
              alt: '原图',
              caption: '仍在原设备',
              align: 'center',
              width: 72,
            },
          },
        ],
      },
      plainText: '原来的正文',
      summary: '',
      revision: 1,
      wordCount: 6,
      status: 'draft',
      updatedAt: '2026-10-19T01:00:00Z',
    },
    'people/p1': {
      id: 'p1',
      name: '虚构人物',
      summary: '旧印象',
      aliases: ['别名'],
      chapterIds: ['c1'],
      customFields: [{ id: 'f1', label: '偏好', value: '读书' }],
      tags: [],
      importantExperiences: '',
      usage: 'fiction',
      workId: 'w1',
    },
  }
  await page.evaluate(async (records) => {
    await new Promise((done, reject) => {
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
    })
  }, records)
  await page.reload()
  const room = async (name) => {
    await page.getByRole('button', { name: '书房', exact: true }).click()
    await page.getByRole('button', { name: new RegExp(name) }).click()
  }
  await page.getByRole('button', { name: '日常', exact: true }).click()
  await page.getByRole('button', { name: '＋ 留一笔' }).click()
  await page.getByLabel('想做什么').fill('手机里的日常待办')
  await page.getByLabel('重复', { exact: true }).selectOption('daily')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('heading', { name: '手机里的日常待办' }).waitFor()
  await page.getByRole('checkbox', { name: '完成待办' }).check()
  await room('每日心情')
  await page.getByRole('button', { name: '开心 0点', exact: true }).click()
  for (let i = 1; i < 5; i++) await page.getByRole('button', { name: `开心 ${i}点`, exact: true }).click()
  await page.getByRole('button', { name: '记下五点' }).click()
  await page.getByRole('button', { name: '色带', exact: true }).click()
  assert.ok(await page.locator('.mood-ribbons .mood-blend-bar').count())
  await page.screenshot({ path: resolve(output, 'moods-light.png'), fullPage: true })
  await room('人物')
  await page.getByRole('button', { name: '展开编辑', exact: true }).click()
  await page.getByLabel('名字', { exact: true }).fill('虚构人物的新名字')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('heading', { name: '虚构人物的新名字' }).waitFor()
  await page.getByRole('button', { name: '创作', exact: true }).click()
  await page.getByRole('button', { name: /原始章节/ }).click()
  await page.getByLabel('章节标题', { exact: true }).fill('手机续写的一章')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('heading', { name: '手机续写的一章' }).waitFor()
  await room('想法工坊')
  await page.getByLabel('写下最初的念头').fill('想把时间留给重要的事')
  await page.getByRole('button', { name: /从这一念开始/ }).click()
  await page.getByRole('button', { name: '方向1：先留下半小时' }).click()
  await page.locator('[data-turn-id]').nth(1).waitFor()
  assert.equal(await page.locator('[data-turn-id]').count(), 2)
  await page.screenshot({ path: resolve(output, 'ideas-light.png'), fullPage: true })
  await page.getByRole('button', { name: '小鱼', exact: true }).click()
  await page.getByRole('checkbox', { name: '仅在本机保留对话' }).check()
  await page.getByLabel('给小鱼的话').fill('这是虚构的测试问候')
  await page.getByRole('button', { name: '发送给小鱼', exact: true }).click()
  await page.getByText('虚构的本机测试回复。', { exact: true }).waitFor()
  await page.reload()
  await page.getByText('虚构的本机测试回复。', { exact: true }).waitFor()
  const mini = await context.newPage()
  await mini.setViewportSize({ width: 320, height: 390 })
  await mini.goto(`${origin}/chat.html`)
  await mini.getByText('虚构的本机测试回复。', { exact: true }).waitFor()
  await mini.screenshot({ path: resolve(output, 'mini-chat.png'), fullPage: true })
  await page.getByRole('button', { name: '清空', exact: true }).click()
  await mini.getByText('虚构的本机测试回复。', { exact: true }).waitFor({ state: 'hidden' })
  await mini.close()
  await room('连接与设置')
  await page.getByRole('button', { name: 'Q 版', exact: true }).click()
  await page.screenshot({ path: resolve(output, 'settings-light.png'), fullPage: true })
  for (const [width, height, colorScheme] of [
    [320, 740, 'dark'],
    [844, 390, 'light'],
  ]) {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    for (const name of ['日记', '每日心情', '想法工坊', '经历册', '片刻仪式', '连接与设置']) {
      await room(name)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      assert.ok(overflow <= 1, `${name} overflows ${overflow}px at ${width}`)
    }
    await page.screenshot({ path: resolve(output, `settings-${width}-${colorScheme}.png`), fullPage: true })
  }
  const saved = await page.evaluate(
    async () =>
      new Promise((done) => {
        const open = indexedDB.open('yiyu-mobile-library-v1', 1)
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('records', 'readonly'),
            read = tx.objectStore('records').get('current')
          tx.oncomplete = () => {
            db.close()
            done(read.result)
          }
        }
      }),
  )
  assert.deepEqual(saved['people/p1'].customFields, records['people/p1'].customFields)
  assert.deepEqual(
    saved['chapters/c1'].content.content[0].content[0].marks,
    records['chapters/c1'].content.content[0].content[0].marks,
  )
  assert.deepEqual(
    saved['chapters/c1'].content.content[1].attrs,
    records['chapters/c1'].content.content[1].attrs,
  )
  const recurring = Object.values(saved).find((value) => value.title === '手机里的日常待办')
  assert.equal(recurring.completed, false)
  assert.equal(recurring.completedDates.length, 1)
  const pet = await context.newPage()
  pet.on('pageerror', (error) => errors.push(error.message))
  await pet.setViewportSize({ width: 192, height: 240 })
  await pet.goto(`${origin}/pet.html`)
  await pet.waitForFunction(() => typeof window.yiyuPetState === 'function')
  for (const pose of ['right-edge', 'left-edge', 'bottom-edge', 'float']) {
    await pet.evaluate(
      (pose) => window.yiyuPetState({ style: 'pixel', pose, motion: false, resting: false, visible: true }),
      pose,
    )
    await pet.waitForFunction((pose) => {
      const canvas = document.querySelector('canvas')
      return (
        canvas?.dataset.pose === pose &&
        canvas?.width &&
        [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data].some(
          (value, index) => index % 4 === 3 && value > 0,
        )
      )
    }, pose)
    await pet.screenshot({ path: resolve(output, `pet-${pose}.png`), omitBackground: true })
  }
  assert.deepEqual(errors, [])
  console.log(
    'YIYU_MOBILE_EXPERIENCE_OK: mobile editing, recurrence, moods, idea continuity, chat opt-in/reload, PC metadata and 320/390/844 layouts; four shared Canvas poses. No real account/model used.',
  )
} finally {
  await browser?.close()
  await new Promise((done) => server.close(done))
}
