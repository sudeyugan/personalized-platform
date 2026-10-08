import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { PetHeartRateCharm } from './PetHeartRateCharm'
import type { PixelPetPose } from '../companion/pixel-pet/types'
import { createHeartPulseRate, type CompanionHeartRateInput } from './companionHeartRate'
import type { CompanionPetStyle } from '../../domain/models'
import { visibleHeartRate, type HeartRateDisplay } from './display'
import './heartRate.css'

export function HeartRateBadge({ visible, variant = 'webm', pose = 'float', style = 'chibi', input }: { visible: boolean; variant?: 'pixel' | 'webm'; pose?: PixelPetPose; style?: CompanionPetStyle; input?: CompanionHeartRateInput }) {
  const visibility = useRef(visible && variant === 'pixel')
  visibility.current = visible && variant === 'pixel'
  const pulseRate = useRef(createHeartPulseRate())
  const [display, setDisplay] = useState<HeartRateDisplay>()
  const [receivedAt, setReceivedAt] = useState(0)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    let disposed = false
    const clearSample = () => { if (input) input.sample.current = null }
    let stop: (() => void) | undefined
    void listen<HeartRateDisplay>('companion:heart-rate', ({ payload }) => {
      if (!disposed) {
        setDisplay(payload); setReceivedAt(Date.now()); setNow(Date.now())
        const bpm = visibleHeartRate(payload)
        if (input) input.sample.current = visibility.current && bpm !== null ? { bpm, at: performance.now() - payload.ageMs! } : null
      }
    }).then((value) => { if (disposed) value(); else stop = value })
    return () => { disposed = true; stop?.(); clearSample() }
  }, [input])
  useEffect(() => { if (!visible || variant !== 'pixel') { if (input) input.sample.current = null } }, [visible, variant, input])
  useEffect(() => {
    if (!visible || !display?.enabled) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [visible, display?.enabled])
  if (!visible || !display?.enabled) return null
  const bpm = visibleHeartRate(display, Math.max(0, now - receivedAt))
  const state = display.phase === 'connected' ? '暂无读数' : display.phase === 'connecting' ? '连接中' : display.phase === 'scanning' ? '查找中' : '未连接'
  const rate = pulseRate.current(performance.now(), bpm)
  return <PetHeartRateCharm bpm={bpm} variant={variant} pose={pose} style={style} rate={rate} input={input} label={bpm ? `心率 ${bpm} 次每分钟` : `心率${state}`} />
}
