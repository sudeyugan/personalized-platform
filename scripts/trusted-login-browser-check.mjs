// Windows Node 24 + isolated Edge. All credentials/content are fictional.
// The copied test manifest pregrants debugger and one fake host; production
// still requires the user's optional permission dialog and per-site consent.
import { spawn } from 'node:child_process'
import { createServer } from 'node:https'
import { X509Certificate, createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const [source, certPath, keyPath, base, output] = process.argv.slice(2)
if (!source || !certPath || !keyPath) throw new Error('Pass production extension folder and synthetic fixture certificate/key')
const folder = mkdtempSync(join(tmpdir(), 'yiyu-trusted-login-')), extension = join(folder, 'extension'), profile = join(folder, 'profile')
cpSync(resolve(source), extension, { recursive: true, filter: path => !path.endsWith('.test.js') })
const manifest = JSON.parse(readFileSync(join(extension, 'manifest.json'), 'utf8'))
manifest.permissions.push('debugger'); manifest.host_permissions.push('https://mail.example.com/*')
manifest.optional_permissions = []
writeFileSync(join(extension, 'manifest.json'), JSON.stringify(manifest))
const cert = readFileSync(certPath), key = readFileSync(keyPath)
const spki = createHash('sha256').update(new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' })).digest('base64')
let posts = 0
const html = `<!doctype html><meta charset="utf-8"><title>虚构登录测试</title>
<form method="post" action="/auth"><input placeholder="测试账号" value="fixture-user"><input type="password" placeholder="测试密码" value="fixture-not-a-credential"><button type="button">登录</button><div role="alert"></div></form>
<script>document.querySelector('button').onclick=event=>{if(!event.isTrusted){document.querySelector('[role=alert]').textContent='密码未输入';return;}document.forms[0].requestSubmit();};</script>`
const server = createServer({ cert, key }, (req, res) => {
  // Do not collect request bodies, credential values or screenshots.
  req.resume()
  if (req.method === 'POST' && req.url === '/auth') posts++
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(req.url === '/auth' ? '<title>虚构收件箱</title><p>仅测试登录接续</p>' : html)
})
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(18543, '127.0.0.1', resolve) })
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
if (!edge) { server.close(); throw new Error('Edge unavailable') }
const browser = spawn(edge, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--no-proxy-server',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
  '--host-resolver-rules=MAP mail.example.com 127.0.0.1:18543', `--ignore-certificate-errors-spki-list=${spki}`, 'https://mail.example.com/login'], { stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(fn) {
  for (let i = 0; i < 100; i++) { const value = await fn().catch(() => undefined); if (value) return value; await pause(150) }
  throw new Error('Owned fixture timed out')
}
async function client(url) {
  const ws = new WebSocket(url), pending = new Map(); let id = 0
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data), request = pending.get(data.id)
    if (!request) return
    pending.delete(data.id); clearTimeout(request.timer)
    data.error ? request.reject(new Error(data.error.message)) : request.resolve(data.result)
  })
  ws.addEventListener('close', () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Owned session closed')) } pending.clear() })
  return { ws, send: (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(new Error('Owned command timed out: ' + method)) }, 15000)
    pending.set(key, { resolve, reject, timer }); ws.send(JSON.stringify({ id: key, method, params }))
  }) }
}
async function evaluate(c, expression) {
  const value = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (value.exceptionDetails) throw new Error('Fixture evaluation failed: ' + (value.exceptionDetails.exception?.description ?? value.exceptionDetails.text))
  return value.result.value
}
let root, worker, port
try {
  const info = await until(async () => {
    const [number, endpoint] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/)
    port = Number(number)
    const info = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json())
    if (new URL(info.webSocketDebuggerUrl).pathname !== endpoint) throw new Error('Owned endpoint mismatch')
    return info
  })
  root = await client(info.webSocketDebuggerUrl)
  const targets = () => fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())
  const background = await until(async () => (await targets()).find(t => t.type === 'service_worker' && t.url.endsWith('/background.js')))
  const popupUrl = background.url.replace('background.js', 'popup.html')
  await root.send('Target.createTarget', { url: popupUrl })
  const target = await until(async () => (await targets()).find(t => t.type === 'page' && t.url === popupUrl))
  worker = await client(target.webSocketDebuggerUrl)
  const moduleUrl = target.url.replace('popup.html', 'login.js')
  const run = `(async()=>{const {continueCachedLogin}=await import(${JSON.stringify(moduleUrl)});const tabs=await chrome.tabs.query({url:'https://mail.example.com/*'});if(tabs.length!==1)throw new Error('Fixture tab ambiguous');return continueCachedLogin({origin:'https://mail.example.com',tabId:tabs[0].id,cachedLogin:true},async()=>{});})()`
  const inspectUrl = target.url.replace('popup.html', 'login-form.js')
  const probe = mode => `(async()=>{const {inspectLoginForm}=await import(${JSON.stringify(inspectUrl)});const tabs=await chrome.tabs.query({url:'https://mail.example.com/*'});if(tabs.length!==1)return;const tab=tabs[0];if(tab.status!=='complete')return;const results=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:false},world:'ISOLATED',func:inspectLoginForm,args:[${JSON.stringify(mode)},tab.url,Date.now()+1000]});return results[0]?.result?.status;})()`
  try { await until(async () => await evaluate(worker, probe(false)) === 'ready') }
  catch {
    const tabs = await evaluate(worker, `chrome.tabs.query({url:'https://mail.example.com/*'}).then(tabs=>tabs.map(({id,url,title,status})=>({id,url,title,status})))`)
    const status = await evaluate(worker, probe(false))
    throw new Error('Fictional page not ready: ' + JSON.stringify({ tabs, status }))
  }
  // Reproduce the old production .click() branch on this same fake form.
  const old = await evaluate(worker, probe(true)), rejected = await evaluate(worker, probe('submitted_check'))
  if (old !== 'submitted' || rejected !== 'rejected' || posts !== 0) throw new Error('Untrusted click did not reproduce rejected submit')
  const current = await evaluate(worker, run)
  if (current !== 'continued' || posts !== 1) throw new Error('Trusted click did not reach the fixture account page exactly once: ' + current + '/' + posts)
  console.log(JSON.stringify({ actualEdgeExtension: true, oldUntrustedClickRejected: true, trustedNativeInputAccepted: true, productionLoginFlow: current, loginPosts: posts,
    permissionWasFixturePregranted: true, simulatedGestureGate: true, realPasswordManagerTested: false, userProfileUsed: false, userAccountUsed: false }))
  if (base && output) {
    await root.send('Target.createTarget', { url: base })
    const appTarget = await until(async () => (await targets()).find(t => t.type === 'page' && t.url.startsWith(base)))
    const app = await client(appTarget.webSocketDebuggerUrl)
    try {
      await until(async () => await evaluate(app, `Boolean(document.querySelector('#root')?.children.length)`))
      await evaluate(app, `(async()=>{
        const [react,dom,{PixelV2Settings},{useLibraryStore},{createSeedLibrary}]=await Promise.all([import('/node_modules/.vite/deps/react.js'),import('/node_modules/.vite/deps/react-dom_client.js'),import('/src/modules/companion/pixel-pet/v2/PixelV2Settings.tsx'),import('/src/state/useLibraryStore.ts'),import('/src/domain/seed.ts')]);
        useLibraryStore.setState({data:createSeedLibrary()});
        const div=document.createElement('div');div.id='version-fixture';div.style='position:fixed;inset:0;z-index:9999;padding:20px;background:var(--bg);overflow:auto';
        const panel=document.createElement('div');panel.style='max-width:600px;margin:0 auto';div.append(panel);document.body.append(div);
        (dom.default??dom).createRoot(panel).render((react.default??react).createElement(PixelV2Settings));
      })()`)
      await until(async () => await evaluate(app, `document.querySelectorAll('#version-fixture .pet-v2-engine button').length===2`))
      const evidence=[]
      for (const [name,width,dark,v2] of [['classic',900,false,false],['tracking',900,false,true],['tracking-dark',900,true,true],['tracking-narrow',360,true,true]]) {
        await app.send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false})
        await evaluate(app, `document.documentElement.dataset.theme=${JSON.stringify(dark?'dark':'light')};document.querySelectorAll('#version-fixture .pet-v2-engine button')[${v2?1:0}].click()`)
        await pause(200)
        const overflow=await evaluate(app, `document.querySelector('#version-fixture').scrollWidth>innerWidth`)
        if(overflow)throw new Error('Version UI overflow: '+name)
        const shot=await app.send('Page.captureScreenshot',{format:'png'})
        writeFileSync(join(output, name+'.png'),Buffer.from(shot.data,'base64'))
        evidence.push({name,width,overflow})
      }
      console.log(JSON.stringify({versionUI:evidence}))
    }finally{app.ws.close()}
  }
} finally {
  worker?.ws.close()
  if (root) { await root.send('Browser.close').catch(() => {}); root.ws.close() } else browser.kill()
  server.close()
  console.log(JSON.stringify({ ownedFixture: folder, userProfileUsed: false, userAccountUsed: false }))
}
