// Windows Node 24 + installed Edge, isolated profile, no camera/user data.
import { spawn } from 'node:child_process'
import { existsSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const [base='http://127.0.0.1:14573',output,mode]=process.argv.slice(2)
if(!output)throw new Error('Explicit fixture output directory required')
mkdirSync(output,{recursive:true})
const profile=mkdtempSync(join(tmpdir(),'yiyu-pixel-v3-check-'))
const edge=['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync)
if(!edge)throw new Error('Edge unavailable')
let port
const browser=spawn(edge,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'})
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function cdp(url){
  const ws=new WebSocket(url),pending=new Map();let sequence=0
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
  ws.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id){const call=pending.get(value.id);pending.delete(value.id);if(value.error)call?.reject(new Error(value.error.message));else call?.resolve(value.result)}})
  ws.addEventListener('close',()=>{for(const call of pending.values())call.reject(new Error('Owned browser closed'));pending.clear()})
  return {ws,send:(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})}
}
let root,page
try{
  let version
  const activeFile=join(profile,'DevToolsActivePort')
  for(let i=0;i<100;i++){
    try{
      const [assigned,endpoint]=readFileSync(activeFile,'utf8').trim().split(/\r?\n/);port=Number(assigned)
      version=await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json())
      if(new URL(version.webSocketDebuggerUrl).pathname!==endpoint)throw new Error('Owned profile endpoint mismatch')
      break
    }catch{version=undefined;await wait(200)}
  }
  if(!version)throw new Error('Isolated Edge launch timed out')
  root=await cdp(version.webSocketDebuggerUrl)
  const tabs=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json())
  page=await cdp(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl)
  await page.send('Page.enable');await page.send('Runtime.enable')
  await page.send('Emulation.setDeviceMetricsOverride',{width:1400,height:850,deviceScaleFactor:1,mobile:false})
  const evaluate=async expression=>{
    const result=await page.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})
    if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const navigate=async query=>{
    await page.send('Page.navigate',{url:`${base}/?pixel-pet-preview&engine=v2&${query}`})
    let ready=false
    for(let i=0;i<120;i++){
      ready=await evaluate(`document.querySelectorAll('canvas[data-pixel-pet-engine="v2"]').length===2 && [...document.querySelectorAll('canvas[data-pixel-pet-engine="v2"]')].every(c=>c.style.display==='block')`)
      if(ready)break;await wait(150)
    }
    if(!ready)throw new Error('V2 canvases not ready: '+query+' '+await evaluate('document.body.innerText.slice(0,1200)'))
    await wait(600)
  }
  const screenshot=async name=>{
    const {data}=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
    writeFileSync(join(output,`${name}.png`),Buffer.from(data,'base64'))
  }
  if(mode!=='benchmark'){
  for(const action of ['neutral','wave','touch-hair','chin','stretch','sleep']){
    await navigate(`action=${action}`);await screenshot(action)
    console.log(JSON.stringify({action,ready:true}))
  }
  for(const side of ['right-edge','left-edge'])for(const look of [-.35,.35]){
    await navigate(`side=${side}&look=${look}`);await screenshot(`${side}-${look<0?'left':'right'}`)
  }
  await navigate('pose=float&action=wave');await screenshot('float-wave')
  await navigate('side=bottom-edge&action=chin');await screenshot('bottom-chin')
  }else await navigate('look=.35')
  // Numeric evidence from the real Canvas path, not the mock context.
  const evidence=await evaluate(`(async()=>{
    const root='/src/modules/companion/pixel-pet/';
    const [{loadRigAssets},{createRigRenderer},{neutralRigFrame},{artEyeCenter},{createPixelRig},{prepareRigFace,rigFacePatchBounds}]=await Promise.all([
      import(root+'v2/rig/RigAssets.ts'),import(root+'v2/rig/RigRenderer.ts'),import(root+'v2/animation/types.ts'),import(root+'art/artProfiles.ts'),import(root+'v2/rig/PixelRig.ts'),import(root+'v2/rig/FaceRenderer.ts')]);
    const textures=await loadRigAssets('right-edge'),renderer=createRigRenderer(textures),canvas=document.createElement('canvas');canvas.width=576;canvas.height=720;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.setTransform(3,0,0,3,0,0);renderer.draw(ctx,neutralRigFrame());
    const a=ctx.getImageData(0,0,576,720).data,b=textures.get('neutral').source.getContext('2d').getImageData(0,0,576,720).data;
    let different=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])different++;
    let outsidePatchChanges=0;const patchDiagnostics=[];
    for(const art of textures.values()){
      const rig=createPixelRig(artEyeCenter(art.profile)),patch=rigFacePatchBounds(art,rig),faceFrame=neutralRigFrame();
      faceFrame.face={eyeOpen:.2,gazeX:.7,gazeY:-.4,smile:.4,blush:.5,browRaise:.5,mouthOpen:.6};
      const changed=prepareRigFace(art,rig,faceFrame).getContext('2d').getImageData(0,0,576,720).data,source=art.source.getContext('2d').getImageData(0,0,576,720).data;
      let count=0,max=0,first=null;
      for(let y=0;y<720;y++)for(let x=0;x<576;x++)if(x<patch.x||x>=patch.x+patch.width||y<patch.y||y>=patch.y+patch.height){const i=(y*576+x)*4;for(let c=0;c<4;c++)if(changed[i+c]!==source[i+c]){outsidePatchChanges++;count++;max=Math.max(max,Math.abs(changed[i+c]-source[i+c]));first??={x,y,c,a:changed[i+c],b:source[i+c]}}}
      patchDiagnostics.push({src:art.profile.src.split('/').pop(),patch,count,max,first});
    }
    const frame=neutralRigFrame();frame.headTurn=.6;frame.joints.head={x:1.5,y:0,angle:.065};frame.face.gazeX=.5;frame.face.gazeY=.1;const samples=[];
    for(let i=0;i<10;i++)renderer.draw(ctx,frame);
    for(let i=0;i<40;i++){const start=performance.now();renderer.draw(ctx,frame);samples.push(performance.now()-start)}
    const ordered=[...samples].sort((a,b)=>a-b);
    return {neutralDifferentChannels:different,outsidePatchChanges,patchDiagnostics,poses:[...textures.keys()],headTurnMeanMs:samples.reduce((s,n)=>s+n,0)/samples.length,headTurnMaxMs:Math.max(...samples),headTurnMedianMs:ordered[20],headTurnP95Ms:ordered[37]};
  })()`)
  writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2))
  console.log(JSON.stringify(evidence))
  if(evidence.neutralDifferentChannels!==0)throw new Error('Neutral no longer matches approved source')
  if(evidence.outsidePatchChanges!==0)throw new Error('Face patch excludes modified pixels')
}finally{
  page?.ws.close()
  if(root){try{await root.send('Browser.close')}catch{}root.ws.close()}else browser.kill()
  console.log('Isolated artifacts: '+output+'; temporary owned profile: '+profile)
}
