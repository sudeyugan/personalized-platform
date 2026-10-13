export type PetActivity = 'quiet' | 'natural' | 'lively'
export type PetWindowMode = 'off' | 'observe' | 'side' | 'top'
export interface PixelPetEnhancements {
  enabled: boolean
  autonomy: boolean
  activity: PetActivity
  windowMode: PetWindowMode
}
export const DEFAULT_PIXEL_ENHANCEMENTS: PixelPetEnhancements = {
  enabled: false, autonomy: true, activity: 'natural', windowMode: 'off',
}
export function normalizePixelEnhancements(raw?: Partial<PixelPetEnhancements> | null): PixelPetEnhancements {
  return {
    enabled: raw?.enabled === true,
    autonomy: raw?.autonomy !== false,
    activity: ['quiet', 'natural', 'lively'].includes(raw?.activity ?? '') ? raw!.activity! : 'natural',
    windowMode: ['off', 'observe', 'side', 'top'].includes(raw?.windowMode ?? '') ? raw!.windowMode! : 'off',
  }
}
