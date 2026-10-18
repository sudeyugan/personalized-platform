import { Pause } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

export function InkWaiting({ reviewing, cancel }: { reviewing: boolean; cancel(): void }) {
  const id = useId().replaceAll(':', '')
  const [slow, setSlow] = useState(false)
  useEffect(() => { const timer = setTimeout(() => setSlow(true), 15000); return () => clearTimeout(timer) }, [])
  return <div className="idea-ink-waiting" role="status" aria-label={reviewing ? '等待发送确认' : '正在酝酿下一段'}>
    <svg viewBox="0 0 360 110" className="idea-waiting-paint" aria-hidden="true">
      <defs><filter id={`${id}-soft`} x="-50%" y="-100%" width="200%" height="300%"><feTurbulence type="fractalNoise" baseFrequency=".025 .09" numOctaves="2" seed="23" result="grain" /><feDisplacementMap in="SourceGraphic" in2="grain" scale="14" /><feGaussianBlur stdDeviation="2" /></filter><radialGradient id={`${id}-wet`}><stop stopColor="currentColor" stopOpacity=".24" /><stop offset=".6" stopColor="currentColor" stopOpacity=".08" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></radialGradient></defs>
      <g fill={`url(#${id}-wet)`} filter={`url(#${id}-soft)`}><ellipse cx="100" cy="57" rx="57" ry="17" /><ellipse cx="201" cy="47" rx="73" ry="22" /><ellipse cx="278" cy="66" rx="43" ry="14" /></g>
    </svg>
    <span className="idea-waiting-note">{reviewing ? '等待你确认发送内容' : slow ? '仍在等待模型返回，可以暂停。' : ''}</span>
    <button type="button" onClick={cancel} className="idea-text-button"><Pause size={13} /> 暂停</button>
  </div>
}
