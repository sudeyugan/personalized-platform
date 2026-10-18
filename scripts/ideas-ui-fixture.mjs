// Isolated real-Edge art/interaction check. Only loopback requests, no account/API.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const { chromium } = require('playwright-core')
const base = process.argv[2] ?? 'http://127.0.0.1:14574'
const output = resolve(process.argv[3] ?? '.inputs/ideas-ui')
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('Only loopback previews are allowed')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, chromiumSandbox: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'no-preference' })
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
  // Do not mount the full app behind the fixture: it could later mount a second
  // copy of this view, duplicating label IDs and confusing real accessibility.
  await page.route(`${base}/`, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type;
    await Promise.all([import('/src/styles/tokens.css'),import('/src/styles/layout.css'),import('/src/styles/components.css'),import('/src/styles/companion.css')]);
    window.__vite_plugin_react_preamble_installed__=true;
  </script></body></html>` }))
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__vite_plugin_react_preamble_installed__ === true)
  await page.evaluate(async () => {
    const react = await import('/node_modules/.vite/deps/react.js'), client = await import('/node_modules/.vite/deps/react-dom_client.js')
    const React = react.default ?? react, createRoot = client.createRoot ?? client.default?.createRoot
    const { IdeaWorkshopView } = await import('/src/modules/ideas/IdeaWorkshopView.tsx')
    const { ideaFixture } = await import('/src/modules/ideas/fixtures.ts')
    const { useLibraryStore } = await import('/src/state/useLibraryStore.ts'), { createSeedLibrary } = await import('/src/domain/seed.ts')
    const data = createSeedLibrary(); data.session.activeView = 'ideas'; data.companion.provider.providerId = 'deepseek'
    useLibraryStore.setState({ data, saveStatus: 'saved' })
    document.getElementById('root').style.display = 'none'
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:999;background:var(--bg)'; document.body.append(host)
    const generate = async request => {
      await new Promise(done => setTimeout(done, 120))
      if (window.__holdIdea) await new Promise(done => { window.__releaseIdea = done })
      const session = useLibraryStore.getState().data.ideas.sessions.find(item => item.id === request.id)
      return session.turns.length ? { ...ideaFixture, reflection: '你选中了“零碎事情”，这让问题清晰了一点：也许值得先保护一小段完整的时间，再观察自己的感受。', question: '明天，如果只留下一件完整的小事，你最想做什么？', options: ['完成一个搁置已久的小项目。', '为真正重视的事，留出完整的一小时。', '先不急着安排，我想弄清忙碌的原因。'], manuscript: ideaFixture.manuscript + '\n\n我更接近的感受是：时间被零碎任务切开了。可以先试着保护一段完整时间，再观察变化。' } : ideaFixture
    }
    createRoot(host).render(React.createElement(IdeaWorkshopView, { generate }))
  })
  await page.getByLabel('写下最初的念头').waitFor()
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
    await page.screenshot({ path: join(output, `empty-${theme}.png`), animations: 'disabled' })
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
  await page.getByLabel('写下最初的念头').fill('我每天都很忙，却总觉得没有做成真正重要的事。')
  await page.getByRole('button', { name: /从这一念开始/ }).click()
  await page.getByRole('heading', { name: '你说的「没做成什么」，更接近哪一种感受？' }).waitFor()
  assert.equal(await page.getByRole('region', { name: '想法手稿' }).count(), 0)
  assert.equal(await page.getByRole('navigation', { name: '我的想法手稿册' }).count(), 0)
  assert.ok(await page.locator('[data-reveal="true"]').count())
  const inkBox = await page.locator('.idea-question-block').boundingBox()
  const delays = await page.locator('.idea-reflection .idea-ink-run').evaluateAll(nodes => nodes.map(node => parseFloat(node.style.getPropertyValue('--ink-delay'))))
  assert.ok(delays.some((delay, index) => index && delay < delays[index - 1]), 'Ink sites must not develop in reading order')
  await page.screenshot({ path: join(output, 'falling-ink.png') })
  const developing = await page.locator('.idea-scroll-chapter .idea-ink-glyph').evaluateAll(nodes => {
    for (const node of nodes) for (const animation of node.getAnimations()) { animation.pause(); animation.currentTime = 1250 }
    return nodes.map(node => ({ bloom: parseFloat(getComputedStyle(node).getPropertyValue('--idea-bloom')), mask: getComputedStyle(node).maskImage }))
  })
  assert.ok(developing.some(value => value.bloom > 9 && value.bloom < 160 && value.mask.includes('radial-gradient')), 'Actual ink must develop through scattered radial sites')
  await page.screenshot({ path: join(output, 'ink-developing.png') })
  await page.locator('.idea-scroll-chapter .idea-ink-glyph').evaluateAll(nodes => { for (const node of nodes) for (const animation of node.getAnimations()) animation.play() })
  await page.getByRole('button', { name: '即刻读完' }).waitFor({ state: 'hidden' })
  assert.deepEqual(await page.locator('.idea-question-block').boundingBox(), inkBox, 'Ink settling must not move text')
  await page.evaluate(() => { window.__holdIdea = true; window.__firstChapter = document.querySelector('.idea-scroll-chapter') })
  await page.getByRole('button', { name: /一直在处理零碎事情/ }).click()
  await page.getByRole('status', { name: '正在酝酿下一段' }).waitFor()
  await page.screenshot({ path: join(output, 'ink-waiting.png') })
  await page.locator('.ideas-workshop').evaluate(node => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')) })
  await page.evaluate(() => { window.__holdIdea = false; window.__releaseIdea() })
  await page.getByRole('heading', { name: '明天，如果只留下一件完整的小事，你最想做什么？' }).waitFor()
  assert.equal(await page.locator('.ideas-workshop').evaluate(node => node.scrollTop), 0, 'Reading above must not be pulled to a new reply')
  assert.equal(await page.evaluate(() => window.__firstChapter === document.querySelector('.idea-scroll-chapter')), true)
  assert.equal(await page.locator('.idea-scroll-chapter').count(), 2)
  assert.equal(await page.locator('.idea-scroll-chapter').first().locator('[hidden]').count(), 0)
  await page.getByRole('button', { name: '即刻读完' }).click()
  await page.getByRole('button', { name: '成稿', exact: true }).click()
  await page.screenshot({ path: join(output, 'manuscript-unedited-1440.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '亲手修订' }).click()
  await page.getByLabel('编辑我的手稿').fill('我想先留出一小时，完成一件真正重视的小事。')
  await page.getByRole('button', { name: '推敲', exact: true }).click()
  assert.equal(await page.locator('[data-reveal="true"]').count(), 0)
  for (const width of [1440, 900, 360]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 1050 })
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
    const overflow = await page.locator('.ideas-workshop').evaluate(node => node.scrollWidth > node.clientWidth + 1)
    assert.equal(overflow, false, `${width}/${theme} overflow`)
    await page.locator('.ideas-workshop').evaluate(node => { node.scrollTop = 0 })
    await page.screenshot({ path: join(output, `${width}-${theme}.png`), animations: 'disabled' })
  }
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
  const library = page.getByRole('button', { name: '手稿册', exact: true })
  await library.click()
  await page.getByRole('dialog', { name: '手稿册' }).waitFor()
  await page.screenshot({ path: join(output, 'library.png'), animations: 'disabled' })
  await page.keyboard.press('Escape')
  assert.equal(await library.evaluate(node => node === document.activeElement), true)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('.ideas-workshop').evaluate(node => { node.scrollTop = node.scrollHeight; node.dispatchEvent(new Event('scroll')) })
  await page.getByRole('button', { name: /先整理到这里/ }).click()
  await page.getByRole('heading', { name: '先把这份想法，留在纸上。' }).waitFor()
  assert.ok(await page.locator('.ideas-workshop').evaluate(node => node.scrollTop > 0), 'Tail continuation must not reset to top')
  assert.equal(await page.locator('.idea-scroll-chapter').count(), 3)
  await page.getByRole('button', { name: '成稿', exact: true }).click()
  await page.getByRole('region', { name: '想法手稿' }).waitFor()
  assert.equal(await page.locator('.idea-ink-run').first().evaluate(node => getComputedStyle(node).animationName), 'none')
  assert.equal(await page.locator('.idea-ink-run').first().evaluate(node => getComputedStyle(node).maskImage), 'none')
  for (const width of [1440, 360]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 1050 })
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
    assert.equal(await page.locator('.ideas-workshop').evaluate(node => node.scrollWidth > node.clientWidth + 1), false)
    await page.screenshot({ path: join(output, `manuscript-${width}-${theme}.png`), animations: 'disabled' })
  }
  await page.getByRole('button', { name: '亲手修订' }).click()
  assert.equal(await page.getByLabel('编辑我的手稿').inputValue(), '我想先留出一小时，完成一件真正重视的小事。')
  await page.getByRole('button', { name: '回到推敲', exact: true }).click()
  await page.locator('.idea-chapter-notes > summary').first().click()
  await page.screenshot({ path: join(output, 'history-360-dark.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '从这里另开一条思路', exact: true }).first().click()
  await page.getByRole('heading', { name: '你说的「没做成什么」，更接近哪一种感受？' }).waitFor()
  assert.equal(await page.locator('[data-reveal="true"]').count(), 0)
  await library.click()
  assert.equal(await page.getByRole('button', { name: /打开手稿：/ }).count(), 2)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ fixture: 'ideas-ui', widths: [1440, 900, 360], themes: ['light', 'dark'], reducedMotion: true, steps: ['seed', 'scattered-ink', 'stable-geometry', 'ink-waiting', 'keep-chapter-dom', 'no-pull-while-reading', 'tail-continuation', 'edit-flush-on-view', 'library-escape-focus', 'collect-in-scroll', 'fork-no-replay'], realApi: false, errors }))
} finally { await browser.close() }
