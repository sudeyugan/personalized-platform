import { lazy,Suspense,useRef } from 'react'
import { normalizePixelEnhancements } from '../../../domain/pixelPetEnhancements'
import { normalizeCompanionPetStyle } from '../../../domain/companionPetStyle'
import { PixelPetRenderer } from './PixelPetRenderer'
import type { PixelPetV2Props } from './v2/PixelPetV2Renderer'
const Enhanced=lazy(()=>import('./v2/PixelPetV2Renderer').then(module=>({default:module.PixelPetV2Renderer})))
export function PixelPetAppearance(props:Omit<PixelPetV2Props,'enhancements'> & {enhancements?:PixelPetV2Props['enhancements']}) {
  const noPointer=useRef(null)
  const settings=normalizePixelEnhancements(props.enhancements)
  if(normalizeCompanionPetStyle(props.style)!=='pixel'||!settings.enabled)return <PixelPetRenderer {...props}/>
  return <Suspense fallback={<PixelPetRenderer {...props} pointer={noPointer}/>}><Enhanced {...props} enhancements={settings}/></Suspense>
}
