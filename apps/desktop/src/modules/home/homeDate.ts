import { useEffect, useState } from 'react'

export function formatHomeDate(now: Date) {
  const hour = now.getHours()
  const greeting = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
  return {
    greeting,
    weekday: new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(now),
    month: `${now.getMonth() + 1}月`,
    day: String(now.getDate()).padStart(2, '0'),
    year: `${now.getFullYear()}年`,
  }
}

export function useLiveDate() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const refresh = () => setNow(new Date())
    const timer = window.setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return formatHomeDate(now)
}
