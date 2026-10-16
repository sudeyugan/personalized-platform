import { randomBytes } from 'node:crypto'
import { installRecorder } from './record-dom.mjs'
const cues=new Set(['inbox','unread','all','notifications','updates','following','next','previous','refresh','search','manual_auth','navigation','unknown_button','unknown_tab'])

export class ManagedRecorder{
  constructor(page,site,tabId){this.page=page;this.site=site;this.tabId=tabId;this.id=randomBytes(32).toString('hex');this.world=`yiyu-record-${this.id}`;this.key=`__${this.id}`;this.events=[];this.phase='recording';this.expires=Date.now()+300000;this.renewed=Date.now();this.frame=undefined}
  async start(){
    this.cdp=await this.page.context().newCDPSession(this.page)
    await this.cdp.send('Page.enable')
    this.contexts=new Set();this.binding=`cue_${this.id}`
    this.mainFrame=(await this.cdp.send('Page.getFrameTree')).frameTree.frame.id
    this.cdp.on('Runtime.executionContextCreated',({context})=>{if(context.name===this.world&&context.auxData?.frameId===this.mainFrame)this.contexts.add(context.id)})
    this.cdp.on('Runtime.executionContextDestroyed',({executionContextId})=>this.contexts.delete(executionContextId))
    this.cdp.on('Runtime.bindingCalled',event=>this.capture(event))
    await this.cdp.send('Runtime.enable')
    await this.cdp.send('Runtime.addBinding',{name:this.binding,executionContextName:this.world})
    const {identifier}=await this.cdp.send('Page.addScriptToEvaluateOnNewDocument',{worldName:this.world,source:`(${installRecorder.toString()})(${JSON.stringify(this.key)},${JSON.stringify(this.site)},${JSON.stringify(this.binding)})`})
    this.script=identifier;await this.poll();return this.snapshot()
  }
  snapshot(){return {id:this.id,origin:this.site,tabId:this.tabId,phase:this.phase,events:[...this.events],remainingSeconds:Math.max(0,Math.ceil((this.expires-Date.now())/1000))}}
  async context(){
    if(this.page.isClosed()||new URL(this.page.url()).origin!==this.site)throw new Error('BROWSER_STALE')
    const {frameTree}=await this.cdp.send('Page.getFrameTree'),frame=frameTree.frame.id
    const {executionContextId}=await this.cdp.send('Page.createIsolatedWorld',{frameId:frame,worldName:this.world,grantUniveralAccess:false})
    return executionContextId
  }
  add(cue){if(this.phase==='recording'&&cues.has(cue)){this.events.push(cue);if(this.events.length>=7)this.phase='review'}}
  capture(event){
    if(event.name!==this.binding||!this.contexts.has(event.executionContextId)||event.payload.length>180||Date.now()>=this.expires||Date.now()-this.renewed>=4500||this.phase==='review'||this.page.isClosed()||new URL(this.page.url()).origin!==this.site)return
    try{
      const value=JSON.parse(event.payload)
      if(!value||typeof value!=='object'||Object.keys(value).some(key=>!['action','cue'].includes(key)))return
      if(value.action==='event')this.add(value.cue)
      else if(value.cue!==undefined)return
      else if(value.action==='pause'&&this.phase==='recording')this.phase='paused'
      else if(value.action==='resume'&&this.phase==='paused')this.phase='recording'
      else if(value.action==='stop'||value.action==='cancel'){this.phase='review';this.cancelled=value.action==='cancel'}
    }catch{/* malformed page messages never become recorded content */}
  }
  async poll(){
    if(this.phase==='review'){await this.stop();return this.cancelled?null:this.snapshot()}
    if(Date.now()>=this.expires||Date.now()-this.renewed>=4500){await this.stop();return this.snapshot()}
    try{
      const contextId=await this.context()
      const changed=this.frame!==contextId
      if(this.frame&&changed)this.add('navigation')
      this.frame=contextId
      // Installation is idempotent and only touches the isolated world's key.
      const install=changed?`(${installRecorder.toString()})(${JSON.stringify(this.key)},${JSON.stringify(this.site)},${JSON.stringify(this.binding)});`:''
      const result=await this.cdp.send('Runtime.evaluate',{contextId,expression:`${install}globalThis[${JSON.stringify(this.key)}]?.poll(${JSON.stringify(this.phase)})`,returnByValue:true})
      if(result.exceptionDetails||!Array.isArray(result.result.value))throw new Error('BROWSER_STALE')
      for(const event of result.result.value.slice(0,14)){
        if(event.action==='cancel'){await this.stop();this.cancelled=true;break}
        if(this.phase==='review')break
        if(event.action==='event')this.add(event.cue)
        else if(event.action==='pause')this.phase='paused'
        else if(event.action==='resume')this.phase='recording'
        else if(event.action==='stop')this.phase='review'
      }
      this.renewed=Date.now();if(this.phase==='review')await this.stop()
    }catch{await this.stop()}
    return this.cancelled?null:this.snapshot()
  }
  async control(action){
    if(action==='cancel'){await this.stop();this.cancelled=true;return null}
    if(action==='stop'){await this.stop();return this.snapshot()}
    await this.poll()
    if(this.cancelled||this.phase==='review'||!['pause','resume'].includes(action)||action==='pause'&&this.phase!=='recording'||action==='resume'&&this.phase!=='paused')throw new Error('BROWSER_STALE')
    this.phase=action==='pause'?'paused':'recording';await this.poll();return this.snapshot()
  }
  async stop(){
    this.phase='review'
    if(!this.cdp)return
    try{const contextId=await this.context();await this.cdp.send('Runtime.evaluate',{contextId,expression:`globalThis[${JSON.stringify(this.key)}]?.close()`});await this.cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:this.script})}catch{/* navigation or page closed: no further capture */}
    await this.cdp.detach().catch(()=>{});this.cdp=undefined
  }
}
