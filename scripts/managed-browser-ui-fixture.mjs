// Local-only settings visual fixture. No Tauri bridge or user account access.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve,join } from 'node:path'
import { createRequire } from 'node:module'
const require=createRequire(new URL('../apps/desktop/package.json',import.meta.url)),{chromium}=require('playwright-core')
const output=resolve(process.argv[2]??'.inputs/managed-browser-ui')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
  const page=await browser.newPage({viewport:{width:900,height:1000}})
  await page.goto('http://127.0.0.1:1436',{waitUntil:'networkidle'})
  await page.evaluate(async()=>{
    const react=await import('/node_modules/.vite/deps/react.js'),client=await import('/node_modules/.vite/deps/react-dom_client.js')
    const React=react.default??react,createRoot=client.createRoot??client.default?.createRoot
    const {BrowserConnectionSection}=await import('/src/modules/browser-connection/BrowserConnectionSection.tsx')
    const {useLibraryStore}=await import('/src/state/useLibraryStore.ts'),{createSeedLibrary}=await import('/src/domain/seed.ts')
    const data=createSeedLibrary();data.companion.browser={enabled:true,backend:'managed',sites:['https://mail.example.com','https://portal.example.com'],interactionSites:['https://mail.example.com'],profiles:[{origin:'https://mail.example.com',role:'mail',label:'学校邮箱'},{origin:'https://portal.example.com',role:'portal',label:'课程门户'}]}
    useLibraryStore.setState({data});document.getElementById('root').hidden=true;document.body.style.background='var(--bg)'
    const container=document.createElement('section');container.className='settings-view';container.style.cssText='padding:20px;max-width:660px;margin:auto;box-sizing:border-box;'
    document.body.append(container);createRoot(container).render(React.createElement(BrowserConnectionSection))
  })
  await page.getByText('小鱼专用浏览器',{exact:true}).last().waitFor()
  for(const width of [900,360])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:1100});await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme)
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
    assert.equal(overflow,false,`overflow ${width}/${theme}`)
    await page.screenshot({path:join(output,`${width}-${theme}.png`),fullPage:true,animations:'disabled'})
  }
  console.log(JSON.stringify({fixture:'managed-browser-ui',widths:[900,360],themes:['light','dark'],horizontalOverflow:false,realAccounts:false}))
}finally{await browser.close()}
