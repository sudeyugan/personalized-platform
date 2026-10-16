import { useLibraryStore } from '../../../state/useLibraryStore'

type Channel='main'|'desktop'
type Pending={channel:Channel;goal:string;origin:string;epoch:number;identity:string;expires:number;ready?:boolean}
let pending:Pending|undefined,timer:ReturnType<typeof setTimeout>|undefined
const receivers=new Map<Channel,(goal:string)=>boolean>()
const identity=()=>{const {data}=useLibraryStore.getState();return JSON.stringify([data.companion.browser,data.companion.provider,data.settings.trust,data.companion.permissions])}
/** One local continuation, never page contents, credentials, IDs or model output. */
export function cancelBrowserHandoff(){pending=undefined;clearTimeout(timer);timer=undefined}
export function armBrowserHandoff(channel:Channel,goal:string,origin:string,epoch:number){
  cancelBrowserHandoff()
  if(!goal.trim()||goal.length>1200||/密码|password|Bearer\s|token\s*[:=]|[?&#]/iu.test(goal))return
  pending={channel,goal,origin,epoch,identity:identity(),expires:Date.now()+300000}
  timer=setTimeout(cancelBrowserHandoff,300000)
}
export function receiveBrowserHandoff(channel:Channel,receive:(goal:string)=>boolean){
  receivers.set(channel,receive)
  if(pending?.ready&&pending.channel===channel)deliver()
  return ()=>{if(receivers.get(channel)===receive)receivers.delete(channel)}
}
export function waitingBrowserHandoff(){return pending?.ready===true}
function deliver(){
  const task=pending
  if(!task?.ready)return false
  if(task.expires<=Date.now()||task.identity!==identity()){cancelBrowserHandoff();return false}
  const receive=receivers.get(task.channel)
  if(!receive)return false
  cancelBrowserHandoff();return receive(task.goal)===true
}
export function resumeAfterLogin(origin:unknown,epoch:number){
  const task=pending
  if(!task)return false
  // Finishing a different site's login must not consume or resume this task.
  if(task.origin!==origin)return false
  if(task.epoch!==epoch||task.expires<=Date.now()||task.identity!==identity()){cancelBrowserHandoff();return false}
  task.ready=true;return deliver()
}
