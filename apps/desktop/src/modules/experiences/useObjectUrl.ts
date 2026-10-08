import { useEffect, useState } from 'react'
export function useObjectUrl(file?: File) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!file) { setUrl(''); return }
    const current = URL.createObjectURL(file)
    setUrl(current)
    return () => URL.revokeObjectURL(current)
  }, [file])
  return url
}
