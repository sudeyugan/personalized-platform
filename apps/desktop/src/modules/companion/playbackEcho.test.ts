import { expect, it } from 'vitest'
import { createPlaybackEchoHistory } from './playbackEcho'

it('rejects delayed earlier sentences and echoed end commands, then expires', () => {
  const history = createPlaybackEchoHistory()
  history.update({ active: true, text: '我们今天先这样，明天可以继续讨论。' }, 1000)
  history.update({ active: true, text: '另外还有一个建议。' }, 2000)
  expect(history.matches('我们今天先这样', 2500)).toBe(true)
  expect(history.matches('先这样', 2500)).toBe(true)
  expect(history.matches('帮我打开日历', 2500)).toBe(false)
  history.update({ active: false }, 3000)
  expect(history.matches('另外还有一个建议', 4000)).toBe(true)
  expect(history.matches('另外还有一个建议', 6001)).toBe(false)
  history.update({ active: true, text: '先这样' }, 7000)
  expect(history.matches('先这样', 7100)).toBe(true)
})
