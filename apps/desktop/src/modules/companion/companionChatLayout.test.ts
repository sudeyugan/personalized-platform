import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Window as TauriWindow } from '@tauri-apps/api/window'
import { positionCompanionChat } from './companionChatLayout'

const mocks = vi.hoisted(() => ({ monitors: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({ availableMonitors: mocks.monitors }))
const portrait = (x: number, y: number, width = 192, height = 240) => ({
  outerPosition: vi.fn().mockResolvedValue({ x, y }),
  outerSize: vi.fn().mockResolvedValue({ width, height }),
}) as unknown as TauriWindow
const chat = () => ({ setSize: vi.fn().mockResolvedValue(undefined), setPosition: vi.fn().mockResolvedValue(undefined) })
describe('adaptive companion chat positioning', () => {
  beforeEach(() => mocks.monitors.mockResolvedValue([{
    scaleFactor: 1, workArea: { position: { x: 0, y: 0 }, size: { width: 1280, height: 720 } },
  }]))
  it('places a compact bubble beside the pet', async () => {
    const target = chat()
    await positionCompanionChat(portrait(1088, 200), target as unknown as TauriWindow, 'bubble')
    expect(target.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 300, height: 210 }))
    expect(target.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 788, y: 200 }))
  })
  it('places bottom-edge dialogue above the pet and keeps it on the work area', async () => {
    const target = chat()
    await positionCompanionChat(portrait(100, 480), target as unknown as TauriWindow, 'full')
    expect(target.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 21, y: 0 }))
  })
  it('uses physical coordinates on a scaled monitor with a negative origin', async () => {
    mocks.monitors.mockResolvedValue([{ scaleFactor: 2, workArea: { position: { x: -2560, y: 0 }, size: { width: 2560, height: 1440 } } }])
    const target = chat()
    await positionCompanionChat(portrait(-2560, 100, 384, 480), target as unknown as TauriWindow, 'voice')
    expect(target.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: -2176, y: 100 }))
  })
  it('serializes mode resizing and continues after a failed operation', async () => {
    const target = chat()
    target.setSize.mockRejectedValueOnce(new Error('closed window'))
    const first = positionCompanionChat(portrait(1088, 200), target as unknown as TauriWindow, 'full')
    const second = positionCompanionChat(portrait(1088, 200), target as unknown as TauriWindow, 'voice')
    await expect(first).rejects.toThrow('closed window')
    await second
    expect(target.setPosition).toHaveBeenCalledTimes(1)
    expect(target.setSize.mock.calls[1][0]).toEqual(expect.objectContaining({ width: 300 }))
  })
})
