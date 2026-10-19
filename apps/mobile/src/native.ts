export interface MobileNative {
  showPet(): void
  hidePet(): void
  saveApiKey(value: string): boolean
  chat(id: string, prompt: string): void
  chatWithContext?(id: string, material: string): void
  voiceReady?(): void
  startVoice?(): void
  stopVoice?(): void
  voiceReply?(session: string, text: string): void
  voiceReject?(session: string): void
  voiceConfigured?(): boolean
  saveVoiceConfig?(key: string, voiceId: string): boolean
  clearVoiceConfig?(): boolean
  ideaRound?(id: string, material: string): void
  configurePet?(style: string, scale: number, motion: boolean): boolean
}
declare global {
  interface Window {
    YiyuMobile?: MobileNative
  }
}
