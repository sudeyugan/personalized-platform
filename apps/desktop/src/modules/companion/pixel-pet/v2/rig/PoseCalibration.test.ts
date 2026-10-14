import { expect, it } from 'vitest'
import { ART_PROFILES,artEyeCenter,artPlacement } from '../../art/artProfiles'
import { FREE_ART_PROFILES } from '../../art/freeArtProfiles'
import { BOTTOM_ART_PROFILES } from '../../art/bottomArtProfiles'
import { calibratePose } from './PoseCalibration'
import { headTurnOffset } from './HeadTurn'

it('fits true eye span and center to side/free/bottom without resizing the neutral artwork',()=>{
  for(const neutral of [ART_PROFILES.pixel,FREE_ART_PROFILES.pixel,BOTTOM_ART_PROFILES.pixel]){
    const source=FREE_ART_PROFILES.pixel,placement=calibratePose(neutral,source)
    const next={...source,placement},a=source.eyes,b=neutral.eyes
    expect(artEyeCenter(next).x).toBeCloseTo(artEyeCenter(neutral).x,10)
    expect(artEyeCenter(next).y).toBeCloseTo(artEyeCenter(neutral).y,10)
    expect(Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y)*placement.scale).toBeCloseTo(Math.hypot(b[1].x-b[0].x,b[1].y-b[0].y)*artPlacement(neutral).scale,10)
    expect(neutral.placement).toBeUndefined()
  }
})
it('turns continuously towards the target, bounds the warp and leaves neck/body untouched',()=>{
  expect(headTurnOffset(0,1,.7)).toBeGreaterThan(0)
  expect(headTurnOffset(0,1,-.7)).toBeLessThan(0)
  expect(headTurnOffset(0,0,1)).toBe(0)
  expect(headTurnOffset(0,1,NaN)).toBe(0)
  for(let dx=-60;dx<60;dx+=.25){
    expect(Math.abs(headTurnOffset(dx,1,1))).toBeLessThanOrEqual(2.81)
    const sourceStep=.25-(headTurnOffset(dx+.25,1,1)-headTurnOffset(dx,1,1))
    expect(sourceStep).toBeGreaterThan(.2) // no fold-over or disconnected islands
  }
})
