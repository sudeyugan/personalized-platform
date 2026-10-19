export interface MobileNative {
  showPet(): void
  hidePet(): void
  saveApiKey(value: string): boolean
  chat(id: string, prompt: string): void
  ideaRound?(id: string, material: string): void
  configurePet?(style: string, scale: number, motion: boolean): boolean
}
declare global {
  interface Window {
    YiyuMobile?: MobileNative
  }
}
