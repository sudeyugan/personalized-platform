import type { PixelPoint } from '../../types'
const clamp=(n:number)=>Math.max(-1,Math.min(1,n))
/** Eyes react immediately. A head direction must persist before following;
 * small changes stay in the eyes, not in the silhouette or the whole body. */
export function createEyeHeadCoordinator(){
  const axes={x:{intent:0,since:0},y:{intent:0,since:0}}
  let previous=-Infinity
  return {
    head(target:PixelPoint,now:number):PixelPoint{
      if(now<previous||now-previous>1000){axes.x.intent=axes.y.intent=0}
      previous=now
      const result={x:0,y:0}
      for(const key of ['x','y'] as const){
        const value=clamp(target[key]),state=axes[key],intent=Math.abs(value)>.16?Math.sign(value):0
        if(intent!==state.intent){state.intent=intent;state.since=now}
        if(intent&&now-state.since>=180)result[key]=Math.sign(value)*(Math.abs(value)-.16)/.84*.72
      }
      return result
    },
    eyes(target:PixelPoint,actualHead:PixelPoint){return {x:clamp(target.x-actualHead.x*.42),y:clamp(target.y-actualHead.y*.28)}},
    reset(){axes.x.intent=axes.y.intent=0;previous=-Infinity},
  }
}
