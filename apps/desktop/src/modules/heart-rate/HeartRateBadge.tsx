import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Heart } from 'lucide-react'
import { visibleHeartRate, type HeartRateDisplay } from './display'
import './heartRate.css'

export function HeartRateBadge({ visible }: { visible: boolean }) {
  const [display, setDisplay] = useState<HeartRateDisplay>()
  const [receivedAt, setReceivedAt] = useState(0)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    void listen<HeartRateDisplay>('companion:heart-rate', ({ payload }) => {
      if (!disposed) { setDisplay(payload); setReceivedAt(Date.now()); setNow(Date.now()) }
    }).then((value) => { if (disposed) value(); else stop = value })
    return () => { disposed = true; stop?.() }
  }, [])
  useEffect(() => {
    if (!visible || !display?.enabled) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [visible, display?.enabled])
  if (!visible || !display?.enabled) return null
  const bpm = visibleHeartRate(display, Math.max(0, now - receivedAt))
  return <span className="pet-heart-rate" role="status" aria-label={bpm ? `心率 ${bpm} 次每分钟` : '心率暂无读数'}>
    <Heart size={11} />{bpm ? <>{bpm}<small>bpm</small></> : <small>{display.phase === 'connected' ? '暂无读数' : display.phase === 'connecting' ? '连接中' : display.phase === 'scanning' ? '查找中' : '未连接'}</small>}
  </span>
}
