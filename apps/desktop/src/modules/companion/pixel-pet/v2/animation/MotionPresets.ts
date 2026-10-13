import { NEUTRAL_FACE, type FaceParameters, type PetExpression } from './types'
export const FACE_PRESETS: Record<PetExpression, FaceParameters> = {
  natural:NEUTRAL_FACE,
  happy:{ ...NEUTRAL_FACE,eyeOpen:.85,browRaise:.12,smile:.8,blush:.2 },
  shy:{ ...NEUTRAL_FACE,eyeOpen:.65,gazeY:.3,smile:.45,blush:.75 },
  curious:{ ...NEUTRAL_FACE,browRaise:.65,smile:.1 },
  surprised:{ ...NEUTRAL_FACE,browRaise:1,mouthOpen:.7 },
  sleepy:{ ...NEUTRAL_FACE,eyeOpen:.08,gazeY:.2 },
}
