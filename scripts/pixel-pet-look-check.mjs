// Actual Canvas/Edge, synthetic geometry only; never requests a camera.
import assert from 'node:assert/strict'
import { mkdir,writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const [base='http://127.0.0.1:14573',output]=process.argv.slice(2)
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)||!output)throw new Error('Explicit local fixture URL/output required')
const require=createRequire(new URL('../apps/desktop/package.json',import.meta.url)),{chromium}=require('playwright-core')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true,chromiumSandbox:true})
try{
  const context=await browser.newContext({viewport:{width:1200,height:1000}}),page=await context.newPage()
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort())
  await page.addInitScript(()=>{globalThis.cameraRequests=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{globalThis.cameraRequests++;throw new Error('No fixture camera access')}})
  await page.goto(`${base}/?pixel-pet-preview&engine=v2&pose=float`,{waitUntil:'domcontentloaded'})
  await page.locator('canvas[data-pixel-pet-engine="v2"][style*="block"]').first().waitFor()
  const evidence=await page.evaluate(async()=>{
    const root='/src/modules/companion/pixel-pet/',[{loadRigAssets},{createRigRenderer},{createMotionController},{neutralRigFrame},{personLook},{applyPoseTransform}]=await Promise.all([
      import(root+'v2/rig/RigAssets.ts'),import(root+'v2/rig/RigRenderer.ts'),import(root+'v2/animation/MotionController.ts'),import(root+'v2/animation/types.ts'),import(root+'v2/perception/LookAttention.ts'),import(root+'pose.ts')])
    const host=document.createElement('main');host.id='look-fixture';host.style='position:fixed;inset:0;z-index:99999;overflow:auto;background:#f4f0e7;color:#403b37;padding:20px;font:14px sans-serif;display:grid;grid-template-columns:repeat(3,1fr);gap:16px';document.body.append(host)
    const cases=[['屏幕左侧 · 看向正中','left-edge',0,400,0,'neutral','idle',1600],['屏幕右下 · 看向正中','right-edge',1728,840,0,'neutral','idle',1600],['底部 · 看向正中','bottom-edge',864,840,0,'neutral','idle',1600],['人向右移 · 先动眼','float',864,300,.25,'neutral','idle',120],['人向右移 · 头轻跟','float',864,300,.25,'neutral','idle',1600],['说话与招手 · 保持目光','float',864,300,.25,'wave','speaking',1600]]
    const evidence=[]
    for(const [label,pose,x,y,faceX,action,conversation,end]of cases){
      const renderer=createRigRenderer(await loadRigAssets(pose)),motion=createMotionController(()=>.5,renderer.center)
      let frame=neutralRigFrame(),desired
      for(let now=0;now<=end;now+=30){
        const face={present:true,x:faceX,y:0,distance:1,yaw:0,pitch:0,at:now},geometry={window:{position:{x,y},size:{width:192,height:240}},screen:{position:{x:0,y:0},size:{width:1920,height:1080}}}
        desired=personLook(now,face,renderer.center,pose,geometry,{pose:action,expression:'natural',target:null,pat:false,speaking:conversation==='speaking'},conversation,false)
        frame=motion.update(now,desired)
      }
      const figure=document.createElement('figure');figure.style='margin:0;text-align:center;background:#fffaf1;border-radius:14px;padding:12px'
      const caption=document.createElement('figcaption');caption.textContent=label
      const canvas=document.createElement('canvas');canvas.width=576;canvas.height=720;canvas.style='width:192px;height:240px;image-rendering:pixelated'
      const ctx=canvas.getContext('2d');applyPoseTransform(ctx,pose==='left-edge'?'left-edge':'right-edge');renderer.draw(ctx,frame)
      figure.append(canvas,caption);host.append(figure)
      evidence.push({label,head:frame.joints.head,eyes:{x:frame.face.gazeX,y:frame.face.gazeY},target:frame.gazeTarget,desired:desired.headLook})
    }
    return evidence
  })
  for(const sample of evidence){assert.ok(Math.abs(sample.head.x)<=2.2&&Math.abs(sample.head.angle)<=.085);assert.ok(Math.abs(sample.eyes.x)<=1&&Math.abs(sample.eyes.y)<=1)}
  assert.equal(evidence[3].head.x,0);assert.ok(evidence[4].head.x>evidence[3].head.x)
  assert.ok(evidence[5].head.x>0)
  await page.screenshot({path:join(output,'look-canvas.png')})
  await page.evaluate(async()=>{
    document.getElementById('look-fixture').remove()
    const path='/src/modules/companion/pixel-pet/v2/',[{default:React},dom,{CameraSettings},{writeCameraPreferences},{updateCameraStatus}]=await Promise.all([
      import('/node_modules/.vite/deps/react.js'),import('/node_modules/.vite/deps/react-dom_client.js'),import(path+'CameraSettings.tsx'),import(path+'perception/CameraPreferences.ts'),import(path+'perception/CameraStatus.ts'),import(path+'PixelV2Settings.css')])
    writeCameraPreferences({enabled:true,calibration:null});updateCameraStatus('active',{present:true,x:.5,y:.5,size:.28,yaw:0,pitch:0,at:performance.now()})
    const host=document.createElement('div');host.id='calibration-fixture';host.className='pet-v2-settings';host.style='position:fixed;inset:12px;z-index:99999;overflow:auto;--surface:#fffaf1;--line:#d7cfc4;--ink:#403b37;--ink-soft:#81766c;background:#f4f0e7';document.body.append(host)
    const {createRoot}=dom.default??dom
    createRoot(host).render(React.createElement(CameraSettings));globalThis.updateFixture=updateCameraStatus
  })
  await page.getByText('摄像头与校准',{exact:true}).click()
  await page.getByRole('button',{name:'校准对视',exact:true}).click()
  // Fresh synthetic frames, not a user's image or a pre-filled calibration.
  for(let index=0;index<10;index++){await page.waitForTimeout(125);await page.evaluate(()=>globalThis.updateFixture('active',{present:true,x:.5,y:.5,size:.28,yaw:0,pitch:0,at:performance.now()}))}
  await page.getByRole('button',{name:'只保存居中结果'}).waitFor()
  for(const width of [1000,360]){await page.setViewportSize({width,height:900});await page.screenshot({path:join(output,`calibration-${width}.png`)});assert.equal(await page.evaluate(()=>document.getElementById('calibration-fixture').scrollWidth<=document.getElementById('calibration-fixture').clientWidth),true)}
  await page.getByRole('button',{name:'只保存居中结果'}).click()
  await page.getByText('居中校准已保存，未改变跟随范围。',{exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>globalThis.cameraRequests),0)
  await writeFile(join(output,'evidence.json'),JSON.stringify({evidence,cameraRequests:0,narrowOverflow:false,centerSaved:true},null,2))
  console.log(JSON.stringify({ok:true,actualCanvas:true,headAfterEyes:true,chatWaveLiveLook:true,calibrationUi:true,narrowOverflow:false,cameraRequests:0,output}))
}finally{await browser.close()}
