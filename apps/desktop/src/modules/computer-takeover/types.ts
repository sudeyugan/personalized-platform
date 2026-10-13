export interface TakeoverWindow { windowId: string; title: string; processId: number }
export interface TakeoverControl { id: string; name: string; automationId: string; controlType: number; canFill: boolean; canInvoke: boolean }
export interface TakeoverObservation { revision: number; windowTitle: string; controls: TakeoverControl[]; truncated: boolean }
export interface TakeoverAction { elementId: string; operation: 'fill' | 'invoke'; text?: string }
export type TakeoverPhase = 'idle' | 'observing' | 'thinking' | 'acting' | 'checking' | 'paused' | 'waiting' | 'finished' | 'stopped' | 'error'
export interface TakeoverProgress { phase: TakeoverPhase; actions: number; message: string; pending?: TakeoverAction; target?: string }
export const takeoverRequestEvent = 'yiyu:prepare-computer-takeover'
