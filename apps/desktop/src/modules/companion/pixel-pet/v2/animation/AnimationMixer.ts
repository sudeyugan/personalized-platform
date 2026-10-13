import type { RigPose } from './types'
export function createAnimationMixer() {
  let current: RigPose='neutral',base=[{pose:'neutral' as RigPose,weight:1}],started=-Infinity
  const sample=(now:number,reduced=false)=>{
    const t=reduced?1:Math.max(0,Math.min(1,(now-started)/360)),weight=t*t*(3-2*t)
    if(weight===1)return [{pose:current,weight:1}]
    const weights=new Map(base.map(item=>[item.pose,item.weight*(1-weight)]))
    weights.set(current,(weights.get(current)??0)+weight)
    return [...weights].map(([pose,weight])=>({pose,weight})).filter(item=>item.weight>0)
  }
  return {
    update(now:number,target:RigPose,reduced=false) {
      if(target!==current){base=sample(now,reduced);current=target;started=now}
      return sample(now,reduced)
    },
    reset(){current='neutral';base=[{pose:'neutral',weight:1}];started=-Infinity},
  }
}
