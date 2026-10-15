import { lookup } from 'node:dns/promises'
import { publicAddress } from './policy.mjs'
const required=['https://live.bilibili.com','https://api.bilibili.com','https://api.live.bilibili.com']
export async function followed(context,sites) {
  if(required.some(site=>!sites.includes(site)))throw new Error('BROWSER_SITE_PERMISSION')
  async function read(url) {
    const addresses=await lookup(new URL(url).hostname,{all:true})
    if(!addresses.length || addresses.some(item=>!publicAddress(item.address)))throw new Error('BROWSER_READ_FAILED')
    // Uses the dedicated context's cookies internally; no cookies exported.
    const response=await context.request.get(url,{timeout:12000,maxRedirects:0})
    try {
      if(response.status()!==200||!response.headers()['content-type']?.includes('json'))throw new Error('BROWSER_READ_FAILED')
      const bytes=await response.body()
      if(bytes.length>131072)throw new Error('BROWSER_READ_FAILED')
      return JSON.parse(bytes.toString('utf8'))
    }finally{await response.dispose()}
  }
  const nav=await read('https://api.bilibili.com/x/web-interface/nav')
  if(nav.code!==0||nav.data?.isLogin!==true)throw new Error('BROWSER_MANAGED_LOGIN')
  const body=await read('https://api.live.bilibili.com/xlive/web-ucenter/v1/xfetter/GetWebList?hit_ab=true')
  if(body.code!==0||!Array.isArray(body.data?.rooms??body.data?.list))throw new Error('BROWSER_READ_FAILED')
  const raw=body.data.rooms??body.data.list
  if(raw.length>5000)throw new Error('BROWSER_READ_FAILED')
  const rooms=raw.slice(0,90).map(item=>{
    const uid=item.uid,roomId=item.room_id??item.roomid,liveStatus=item.live_status
    if(!Number.isSafeInteger(uid)||uid<=0||!Number.isSafeInteger(roomId)||roomId<=0||![0,1,2].includes(liveStatus)||typeof item.uname!=='string'||!item.uname.trim())throw new Error('BROWSER_READ_FAILED')
    return {uid,roomId,name:item.uname.trim().slice(0,80),title:typeof item.title==='string'?item.title.slice(0,200):'',liveStatus}
  }).filter((room,index,all)=>all.findIndex(item=>item.uid===room.uid&&item.roomId===room.roomId)===index)
  const count=body.data.count??body.data.total,total=Number.isSafeInteger(count)&&count>=0?count:null
  return {loggedIn:true,rooms,checked:rooms.length,total,complete:total!==null&&rooms.length===total}
}
