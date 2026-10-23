export interface MobileNative {
  showPet(): void
  hidePet(): void
  saveApiKey(value: string): boolean
  configHandoff?(operation: string, input: string): string
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
  desktopSenseStatus?(): string
  setDesktopSense?(enabled: boolean): void
}
declare global {
  interface Window {
    YiyuMobile?: MobileNative
  }
}
