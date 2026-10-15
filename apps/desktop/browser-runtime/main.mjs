import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { BrowserEngine } from './engine.mjs'
const profile=process.argv[2]
if(!profile || resolve(profile)!==profile)process.exit(2)
const engine=new BrowserEngine(profile)
let chain=Promise.resolve(),timer,closed=false
const idle=()=>{clearTimeout(timer);timer=setTimeout(()=>{chain=chain.then(()=>engine.close()).catch(()=>{})},engine.mode==='login'?600000:120000)}
const reader=createInterface({input:process.stdin,crlfDelay:Infinity})
reader.on('line',line=>{
  clearTimeout(timer)
  if(Buffer.byteLength(line)>16384){process.exitCode=2;reader.close();return}
  chain=chain.then(async()=>{
    let id=0
    try {
      const command=JSON.parse(line);id=command.id
      if(!Number.isSafeInteger(id)||id<1)throw new Error('BROWSER_ARGUMENT')
      let data
      if(command.kind==='configure')data=await engine.configure(command)
      else if(command.kind==='login')data=await engine.login(command.origin,command.url)
      else if(command.kind==='finish'){await engine.close();data={mode:'idle'}}
      else if(command.kind==='request')data=await engine.request(command.request)
      else throw new Error('BROWSER_ARGUMENT')
      process.stdout.write(`${JSON.stringify({id,ok:true,data})}\n`)
    } catch(error) {
      const code=/^BROWSER_[A-Z_]+$/.test(error?.message)?error.message:'BROWSER_MANAGED_FAILED'
      process.stdout.write(`${JSON.stringify({id,ok:false,error:code})}\n`)
    }
    if(!closed)idle()
  })
})
const close=()=>{if(closed)return;closed=true;clearTimeout(timer);chain=chain.finally(()=>engine.close()).finally(()=>process.exit(0))}
reader.on('close',close);process.on('SIGTERM',close);process.on('SIGINT',close)
