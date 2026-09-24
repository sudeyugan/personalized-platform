import { invoke } from '@tauri-apps/api/core'
import type { CompanionComputerSettings } from '../domain/models'

export interface ComputerActionRequest {
  action: string
  params?: Record<string, unknown>
}

const isTauriRuntime = () => '__TAURI_INTERNALS__' in window

export function createComputerService(policy: CompanionComputerSettings) {
  return {
    async execute(request: ComputerActionRequest, confirmed: boolean) {
      if (!isTauriRuntime()) throw new Error('电脑能力仅在 Windows 桌面版可用')
      return invoke<unknown>('computer_execute', { request, policy, confirmed })
    },
    async stopAll() {
      if (!isTauriRuntime()) return { stopped: false }
      return invoke<unknown>('computer_emergency_stop')
    },
    async status() {
      if (!isTauriRuntime()) return { recordings: [], processes: [] }
      return invoke<unknown>('computer_status')
    },
    async detectFfmpeg() {
      if (!isTauriRuntime()) return undefined
      return invoke<string | null>('computer_detect_ffmpeg')
    },
  }
}