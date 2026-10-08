// Memory-only handoff for audio captured AFTER local wake/speaker verification.
// Never feed standby audio into this queue. Ending a session discards it.
export function pcm16Base64(samples: number[]) {
  const bytes = new Uint8Array(samples.length * 2)
  const view = new DataView(bytes.buffer)
  samples.forEach((value, index) => {
    const sample = Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0))
    view.setInt16(index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true)
  })
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function createPostWakeAudio() {
  let queued: number[] = []
  let sender: ((audioBase64: string) => void) | undefined
  let closed = false
  const flush = () => {
    if (!sender || closed) return
    while (queued.length >= 1600) {
      const chunk = queued.slice(0, 6400)
      try { sender(pcm16Base64(chunk)) } catch { sender = undefined; return }
      queued.splice(0, chunk.length)
    }
  }
  return {
    push: (samples: number[]) => {
      if (closed) return
      queued.push(...samples)
      // Eight seconds maximum while token/socket starts; no disk persistence.
      if (queued.length > 128_000) queued = queued.slice(-128_000)
      flush()
    },
    attach: (next: (audioBase64: string) => void) => { if (!closed) { sender = next; flush() } },
    detach: () => { sender = undefined; queued = [] },
    close: () => { closed = true; sender = undefined; queued = [] },
  }
}
