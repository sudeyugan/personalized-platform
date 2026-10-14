import { expect, it } from 'vitest'
import { ART_PROFILES, artPlacement } from '../../art/artProfiles'
import { FREE_ART_PROFILES } from '../../art/freeArtProfiles'
import { BOTTOM_ART_PROFILES } from '../../art/bottomArtProfiles'
import { calibratePose } from './PoseCalibration'
import { gestureWeight, poseArtProfile, poseBodyOffset, waveGesture } from './PoseAppearance'

it('keeps the head untouched and smoothly aligns the chest to the side grip',()=>{
  const neutral=ART_PROFILES.pixel,profile=poseArtProfile('wave','fixture')
  profile.placement=calibratePose(neutral,profile)
  const fit=artPlacement(profile),base=artPlacement(neutral)
  expect(poseBodyOffset(fit.y+620*fit.scale,neutral,profile)).toBe(0)
  expect(fit.x+650*fit.scale+poseBodyOffset(fit.y+950*fit.scale,neutral,profile)).toBeCloseTo(base.x+835*base.scale)
  for(let y=0;y<240;y+=.1)expect(Math.abs(poseBodyOffset(y+.1,neutral,profile)-poseBodyOffset(y,neutral,profile))).toBeLessThan(.1)
  expect(poseBodyOffset(200,FREE_ART_PROFILES.pixel,profile)).toBe(0)
  expect(poseBodyOffset(200,BOTTOM_ART_PROFILES.pixel,profile)).toBe(0)
})
it('limits the waving mask to the raised wrist, not the torso or the neutral gripping hands',()=>{
  const neutral=ART_PROFILES.pixel,profile=poseArtProfile('wave','fixture')
  profile.placement=calibratePose(neutral,profile)
  const wrist=waveGesture(neutral,profile)
  expect(gestureWeight(wrist.x,wrist.y,wrist)).toBe(1)
  expect(gestureWeight(170,200,wrist)).toBe(0)
  expect(gestureWeight(wrist.cx,wrist.cy+wrist.ry*1.25,wrist)).toBe(0)
  expect(gestureWeight(wrist.cx,wrist.cy-wrist.ry*.6,wrist)).toBe(1)
  expect(profile.eyes).not.toBe(FREE_ART_PROFILES.pixel.eyes)
})
