import type { PixelPoint } from '../../types'
export type RigPose = 'neutral' | 'wave' | 'touch-hair' | 'chin' | 'stretch' | 'sleep' | 'peek'
export type PetExpression = 'natural' | 'happy' | 'shy' | 'curious' | 'surprised' | 'sleepy'
export interface FaceParameters {
  eyeOpen: number; gazeX: number; gazeY: number; browRaise: number
  smile: number; blush: number; mouthOpen: number
}
export interface JointTransform { x: number; y: number; angle: number }
export type RigJoint = 'root' | 'body' | 'head' | 'leftArm' | 'rightArm' | 'hair'
export interface RigFrame {
  joints: Record<RigJoint, JointTransform>
  face: FaceParameters
  poses: { pose: RigPose; weight: number }[]
  gazeTarget: PixelPoint | null
}
export const NEUTRAL_FACE: FaceParameters = { eyeOpen:1, gazeX:0, gazeY:0, browRaise:0, smile:0, blush:0, mouthOpen:0 }
export const joint = (): JointTransform => ({ x:0, y:0, angle:0 })
export const neutralRigFrame = (): RigFrame => ({ joints:{ root:joint(), body:joint(), head:joint(), leftArm:joint(), rightArm:joint(), hair:joint() }, face:{ ...NEUTRAL_FACE }, poses:[{pose:'neutral',weight:1}],gazeTarget:null })
