// Windows Node24 + fresh Edge profile. Production reader and separate helper;
// only a fictional site's host is pregranted, NOT debugger in the reader.
// Unpacked fixture loading does not verify the user's installation dialog.
import { spawn } from 'node:child_process'
import { createServer as httpsServer } from 'node:https'
import { createServer as httpServer } from 'node:http'
import { X509Certificate,createHash } from 'node:crypto'
import { cpSync,existsSync,mkdtempSync,readFileSync,writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join,resolve } from 'node:path'
const [source,helperSource,certPath,keyPath,base,output]=process.argv.slice(2)
if(!keyPath)throw new Error('Pass reader folder, helper folder, synthetic certificate/key')
const folder=mkdtempSync(join(tmpdir(),'yiyu-two-extension-')),reader=join(folder,'reader'),helper=join(folder,'helper'),profile=join(folder,'profile')
for(const [from,to] of [[source,reader],[helperSource,helper]])cpSync(resolve(from),to,{recursive:true,filter:path=>!path.endsWith('.test.js')})
const manifest=JSON.parse(readFileSync(join(reader,'manifest.json'),'utf8'))
if([...(manifest.permissions??[]),...(manifest.optional_permissions??[])].includes('debugger'))throw new Error('Reader must not request debugger')
const site='https://mail.example.com',code='f'.repeat(64),revision='a'.repeat(64),recordId='b'.repeat(64)
manifest.host_permissions.push(`${site}/*`);writeFileSync(join(reader,'manifest.json'),JSON.stringify(manifest))
writeFileSync(join(reader,'policy.js'),readFileSync(join(reader,'policy.js'),'utf8').replace('127.0.0.1:38471','127.0.0.1:38475'))
writeFileSync(join(reader,'revision.js'),`export const EXTENSION_REVISION = '${revision}';\n`)
const cert=readFileSync(certPath),key=readFileSync(keyPath),spki=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64')
let posts=0,pairOrigin,queued,active,reply,recording,events=[]
const page=`<!doctype html><meta charset="utf-8"><title>虚构登录测试</title><form method="post" action="/auth"><input placeholder="账号" value="fixture-user"><input type="password" placeholder="密码" value="fixture-not-a-credential"><button type="button">登录</button><div role="alert"></div></form><script>document.querySelector('button').onclick=e=>{if(!e.isTrusted){document.querySelector('[role=alert]').textContent='密码未输入';return;}document.forms[0].requestSubmit();}</script>`
const account='<title>虚构收件箱</title><p>未读邮件 2</p><button id="inbox">收件箱</button><button id="unread">未读</button><button id="unknown">fictional private subject</button><button id="delete">删除</button><input id="private" placeholder="正文不记录"><a id="next" href="/auth?page=2">下一页</a>'
const web=httpsServer({cert,key},(req,res)=>{req.resume();if(req.method==='POST'&&req.url==='/auth')posts++;res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.url?.startsWith('/auth')?account:page)})
const bridge=httpServer((req,res)=>{
  const origin=req.headers['x-yiyu-extension'];res.setHeader('Access-Control-Allow-Origin',origin??'*');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization,X-Yiyu-Extension');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS')
  if(req.method==='OPTIONS'){res.end();return}
  let raw='';req.on('data',part=>{raw+=part;if(raw.length>65536)req.destroy()});req.on('end',()=>{
    let body;try{body=JSON.parse(raw)}catch{res.writeHead(400);res.end();return}
    let result
    if(req.url==='/pair'&&body.code===code){pairOrigin=origin;result={paired:true}}
    else if(origin!==pairOrigin||req.headers.authorization!==`Bearer ${code}`){res.writeHead(403);res.end();return}
    else if(req.url==='/poll'){const job=queued;queued=undefined;result={job:job??null,recording:recording??null,maintenance:{version:manifest.version,revision,ready:true,enabled:true,sites:[site],epoch:1,setup:null}}}
    else if(req.url==='/active')result={active:body.id===active}
    else if(req.url==='/reply'){reply=body;active=undefined;result={ok:true}}
    else if(req.url==='/record'){
      if(body.recordingId!==recording?.id||Object.keys(body).some(k=>!['recordingId','action','cue'].includes(k))){res.writeHead(403);res.end();return}
      if(body.action==='event'){if(!['inbox','unread','unknown_button','manual_auth','navigation','next'].includes(body.cue))throw new Error('Fixture received unknown content');events.push(body.cue)}
      else if(body.action==='pause')recording.phase='paused'
      else if(body.action==='resume')recording.phase='recording'
      else if(['stop','cancel'].includes(body.action))recording=undefined
      result={ok:true}
    }else{res.writeHead(403);res.end();return}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result))
  })
})
await Promise.all([new Promise((r,j)=>{web.once('error',j);web.listen(18543,'127.0.0.1',r)}),new Promise((r,j)=>{bridge.once('error',j);bridge.listen(38475,'127.0.0.1',r)})])
const edge=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
if(!edge)throw new Error('Edge unavailable')
const browser=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--no-proxy-server','--remote-debugging-port=0',`--user-data-dir=${profile}`,`--disable-extensions-except=${reader},${helper}`,`--load-extension=${reader},${helper}`,'--host-resolver-rules=MAP mail.example.com 127.0.0.1:18543, MAP other.example.com 127.0.0.1:18543',`--ignore-certificate-errors-spki-list=${spki}`,`${site}/login`],{stdio:'ignore'})
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn){for(let i=0;i<100;i++){const value=await fn().catch(()=>undefined);if(value)return value;await pause(150)}throw new Error('Owned fixture timed out')}
async function client(url){
  const ws=new WebSocket(url),pending=new Map();let id=0
  await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})})
  ws.addEventListener('message',e=>{const data=JSON.parse(e.data),p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(new Error(data.error.message)):p.resolve(data.result)})
  ws.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Owned session closed'))}pending.clear()})
  return {ws,send:(method,params={})=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(new Error('Owned command timed out: '+method))},15000);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}))})}
}
async function evaluate(c,expression){const value=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw new Error('Fixture evaluation failed: '+(value.exceptionDetails.exception?.description??value.exceptionDetails.text));return value.result.value}
let root,popup,connection,accountClient,port
try{
  const info=await until(async()=>{const [number,endpoint]=readFileSync(join(profile,'DevToolsActivePort'),'utf8').trim().split(/\r?\n/);port=Number(number);const info=await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json());if(new URL(info.webSocketDebuggerUrl).pathname!==endpoint)throw new Error('Owned endpoint mismatch');return info})
  root=await client(info.webSocketDebuggerUrl);const targets=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json())
  const readerWorker=await until(async()=>(await targets()).find(t=>t.type==='service_worker'&&t.url.endsWith('/background.js')&&!t.url.includes('jioaddpafbaidcmdnnooljbkkhlaajpl')))
  const popupUrl=readerWorker.url.replace('background.js','popup.html');await root.send('Target.createTarget',{url:popupUrl})
  popup=await client((await until(async()=>(await targets()).find(t=>t.url===popupUrl))).webSocketDebuggerUrl)
  await until(async()=>await evaluate(popup,`Boolean(document.querySelector('#status')?.textContent)&&Boolean(document.querySelector('#trustedLoginStatus')?.textContent)`))
  await evaluate(popup,`document.querySelector('#code').value=${JSON.stringify(code)};document.querySelector('#connect').click()`);await until(async()=>Boolean(pairOrigin))
  const tabs=await until(async()=>{const tabs=await evaluate(popup,`chrome.tabs.query({url:'${site}/*'}).then(t=>t.filter(x=>x.status==='complete').map(x=>({id:x.id})))`);return tabs?.length===1?tabs:undefined});const tabId=tabs[0].id
  const request=async id=>{reply=undefined;active=id;queued={id,kind:'page',origin:site,tabId,cachedLogin:true};await evaluate(popup,`chrome.runtime.sendMessage({type:'wake'})`);return until(async()=>reply)}
  const old=await request('fixture-untrusted');if(!old.ok||old.data.loginState!=='submit_rejected'||posts!==0)throw new Error('Old script rejection not reproduced: '+JSON.stringify({ok:old.ok,state:old.data?.loginState,posts,error:old.error}))
  await evaluate(popup,`document.querySelector('#connectTrusted').click()`)
  const helperPage=await until(async()=>(await targets()).find(t=>t.url.startsWith('chrome-extension://jioaddpafbaidcmdnnooljbkkhlaajpl/connect.html#')))
  connection=await client(helperPage.webSocketDebuggerUrl);await until(async()=>await evaluate(connection,`Boolean(document.querySelector('#reader')?.textContent)&&document.querySelector('#confirm')?.disabled===false`));await evaluate(connection,`document.querySelector('#confirm').click()`)
  await until(async()=>await evaluate(connection,`document.querySelector('#status').textContent.includes('已连接')`))
  const current=await request('fixture-trusted');if(!current.ok||current.data.loginState!=='continued'||posts!==1)throw new Error('Trusted flow did not complete once: '+JSON.stringify({ok:current.ok,state:current.data?.loginState,posts,error:current.error}))
  const permissions=await evaluate(popup,'chrome.permissions.getAll()');if(permissions.permissions.includes('debugger'))throw new Error('Reader obtained debugger')
  const target=await until(async()=>(await targets()).find(t=>t.type==='page'&&t.url===site+'/auth'));accountClient=await client(target.webSocketDebuggerUrl)
  recording={id:recordId,origin:site,tabId,phase:'recording',ttlMs:4500};await evaluate(popup,`chrome.runtime.sendMessage({type:'wake'})`)
  await until(async()=>await evaluate(accountClient,`Boolean(document.querySelector('[data-yiyu-recording]'))`))
  const click=async selector=>{const point=await evaluate(accountClient,`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await accountClient.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1})}
  await click('#inbox');await click('#unread');await click('#unknown');await until(async()=>events.length===3)
  await click('#private');await accountClient.send('Input.insertText',{text:'fictional input must not be captured'});await pause(200)
  if(JSON.stringify(events)!==JSON.stringify(['inbox','unread','unknown_button']))throw new Error('Unexpected recording output')
  await click('#delete');await until(async()=>recording.phase==='paused');await evaluate(popup,`chrome.runtime.sendMessage({type:'wake'})`);await pause(300);await click('#inbox');await pause(200);if(events.length!==3)throw new Error('Pause did not stop recording')
  recording.phase='recording';await evaluate(popup,`chrome.runtime.sendMessage({type:'wake'})`);await pause(300);await click('#next')
  await until(async()=>await evaluate(accountClient,`location.pathname+location.search==='/auth?page=2'`));await evaluate(popup,`chrome.runtime.sendMessage({type:'wake'})`)
  await until(async()=>events.includes('navigation'));if(JSON.stringify(events)!==JSON.stringify(['inbox','unread','unknown_button','next','navigation']))throw new Error('Same-site navigation lost semantic identity')
  await accountClient.send('Page.navigate',{url:'https://other.example.com/auth'});await until(async()=>await evaluate(accountClient,`location.hostname==='other.example.com'`));await evaluate(popup,`chrome.runtime.sendMessage({type:'wake'})`);await until(async()=>recording===undefined)
  if(events.length!==5)throw new Error('Cross-site captured another page')
  recording=undefined;await evaluate(popup,`chrome.runtime.sendMessage({type:'wake'})`);await until(async()=>await evaluate(accountClient,`!document.querySelector('[data-yiyu-recording]')`))
  console.log(JSON.stringify({actualEdgeTwoExtensions:true,readerHasNoDebugger:true,oldUntrustedClickRejected:true,trustedNativeInputAccepted:true,productionLoginFlow:current.data.loginState,loginPosts:posts,semanticRecording:events,privateInputRecorded:false,pauseAndCleanup:true,sameSiteNavigation:true,crossSiteStopped:true,installationDialogTested:false,realPasswordManagerTested:false,userProfileUsed:false,userAccountUsed:false}))
  if(base&&output){
    await root.send('Target.createTarget',{url:base});const target=await until(async()=>(await targets()).find(t=>t.type==='page'&&t.url.startsWith(base))),ui=await client(target.webSocketDebuggerUrl)
    try{
      await until(async()=>await evaluate(ui,`Boolean(document.querySelector('#root')?.children.length)`))
      await evaluate(ui,`(async()=>{
        await import('/src/modules/browser-connection/browser.css');
        const [r,d,{BrowserRecordingCard},{RecordingReview},{useLibraryStore},{createSeedLibrary}]=await Promise.all([import('/node_modules/.vite/deps/react.js'),import('/node_modules/.vite/deps/react-dom_client.js'),import('/src/modules/browser-connection/recording/BrowserRecordingCard.tsx'),import('/src/modules/browser-connection/recording/RecordingReview.tsx'),import('/src/state/useLibraryStore.ts'),import('/src/domain/seed.ts')]);
        const react=r.default??r,dom=d.default??d,data=createSeedLibrary();data.companion.browser={enabled:true,sites:['https://mail.example.com']};useLibraryStore.setState({data});
        const host=document.createElement('div');host.id='record-fixture';host.style='position:fixed;inset:0;z-index:9999;padding:20px;background:var(--bg);overflow:auto';document.body.append(host);
        const inner=document.createElement('div');inner.style='max-width:600px;margin:0 auto';host.append(inner);globalThis.fixtureRoot=dom.createRoot(inner);
        globalThis.showRecording=(review)=>fixtureRoot.render(review?react.createElement('div',{className:'browser-recording browser-recording-body'},react.createElement(RecordingReview,{record:{id:'${recordId}',origin:'${site}',tabId:7,phase:'review',events:['inbox','unread','unknown_button'],remainingSeconds:120},goal:'查看我的邮箱未读',onDone:()=>{}})):react.createElement(BrowserRecordingCard));showRecording(false);
      })()`)
      for(const [name,width,dark,review] of [['start',900,false,false],['review',900,false,true],['review-dark',900,true,true],['review-narrow',360,true,true]]){
        await ui.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await evaluate(ui,`document.documentElement.dataset.theme='${dark?'dark':'light'}';showRecording(${review})`);await pause(250)
        if(!review)await evaluate(ui,`document.querySelector('#record-fixture details').open=true`)
        const overflow=await evaluate(ui,`document.querySelector('#record-fixture').scrollWidth>innerWidth`);if(overflow)throw new Error('Recording UI overflow: '+name)
        writeFileSync(join(output,name+'.png'),Buffer.from((await ui.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
      }
      console.log(JSON.stringify({recordingUI:'light/dark/360 no overflow'}))
    }finally{ui.ws.close()}
  }
}finally{
  popup?.ws.close();connection?.ws.close();accountClient?.ws.close();if(root){await root.send('Browser.close').catch(()=>{});root.ws.close()}else browser.kill();web.close();bridge.close();console.log(JSON.stringify({ownedFixture:folder,userProfileUsed:false,userAccountUsed:false}))
}
