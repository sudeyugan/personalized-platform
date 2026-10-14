import type { PetActivity } from '../../../../../domain/pixelPetEnhancements'
import type { RigPose } from '../animation/types'
interface Behavior { pose:RigPose; idle:number; duration:number; cooldown:number; weight:number }
const BEHAVIORS:Behavior[]=[
  {pose:'touch-hair',idle:16000,duration:3400,cooldown:90000,weight:3},
  {pose:'stretch',idle:42000,duration:3800,cooldown:160000,weight:2},
  {pose:'chin',idle:65000,duration:6500,cooldown:120000,weight:3},
  {pose:'sleep',idle:140000,duration:Infinity,cooldown:0,weight:1},
]
export function createBehaviorScheduler(random=Math.random) {
  const cooldown=new Map<RigPose,number>()
  let current:RigPose='neutral',until=0,nextChoice=12000
  return {
    step(now:number,idle:number,enabled:boolean,activity:PetActivity,blocked:boolean,initiative=.3) {
      if(blocked||!enabled){current='neutral';until=0;nextChoice=Math.max(nextChoice,now+8000);return current}
      if(current!=='neutral'&&now<until)return current
      current='neutral'
      if(now<nextChoice)return current
      const pace=activity==='quiet'?2.2:activity==='lively'?.65:1
      nextChoice=now+(10000+Math.max(0,Math.min(1,random()))*18000)*pace
      const candidates=BEHAVIORS.filter(b=>idle>=b.idle*pace&&now>=(cooldown.get(b.pose)??0))
      if(!candidates.length)return current
      // Rest cannot be interrupted by an ordinary random choice.
      const rest=candidates.find(b=>b.pose==='sleep')
      const total=candidates.reduce((sum,b)=>sum+b.weight,0),pick=Math.max(0,Math.min(.999,random()))*total
      let cumulative=0
      const selected=rest??candidates.find(b=>(cumulative+=b.weight)>pick)!
      if(!rest&&random()>Math.min(.95,.4+initiative*.45))return current
      current=selected.pose;until=now+selected.duration;cooldown.set(current,now+selected.cooldown)
      return current
    },
    interrupt(now:number){current='neutral';until=0;nextChoice=now+8000},
  }
}
