import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { petTransform } from '../../../../mobile/src/companion/figurineMotion'
import { DesktopSenseSettings } from '../../../../mobile/src/companion/DesktopSenseSettings'

afterEach(() => { cleanup(); delete window.YiyuMobile; vi.useRealTimers() })
describe('mobile companion contact motion', () => {
  it('keeps contact fixed during breathing and settling, with finite bounded transforms', () => {
    for (const action of ['idle', 'lift', 'land', 'sit', 'stand', 'edge'] as const)
      for (let time = 0; time < 21000; time += 37) {
        const value = petTransform(time, action, 100, true, true, 'left-edge')
        expect(Object.values(value).every(Number.isFinite)).toBe(true)
        expect(Math.abs(value.angle)).toBeLessThan(.075)
        expect(value.scaleX).toBeGreaterThan(.97)
        expect(value.scaleY).toBeGreaterThan(.97)
        expect(value.scaleY).toBeLessThan(1.03)
        if (action !== 'lift') expect(value.y).toBe(0)
      }
  })
  it('honors reduced motion and never carries the lifted pose after release', () => {
    expect(petTransform(500, 'lift', 100, false, false, 'right-edge')).toEqual({ x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1 })
    expect(petTransform(500, 'lift', 100, true, false, '')).toMatchObject({ y: -3 })
    expect(petTransform(2000, 'land', 100, true, false, '')).toMatchObject({ y: 0, angle: 0 })
  })
})
describe('optional launcher sensing settings', () => {
  it('does not request permission automatically and keeps the system grant separate', () => {
    vi.useFakeTimers()
    const native = { desktopSenseStatus: vi.fn(() => JSON.stringify({ requested: false, enabled: false, connected: false, desktop: false, surfaces: 0 })), setDesktopSense: vi.fn() }
    window.YiyuMobile = native as unknown as NonNullable<Window['YiyuMobile']>
    render(<DesktopSenseSettings />)
    expect(screen.getByRole('status')).toHaveTextContent('尚未开启')
    expect(native.setDesktopSense).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '开启桌面停靠' }))
    expect(native.setDesktopSense).toHaveBeenCalledExactlyOnceWith(true)
    expect(screen.getByRole('status')).toHaveTextContent('尚未开启')
  })
  it('allows immediate opt-out while preserving the rest of companion settings', () => {
    const native = { desktopSenseStatus: () => JSON.stringify({ requested: true, enabled: true, connected: true, desktop: false, surfaces: 0 }), setDesktopSense: vi.fn() }
    window.YiyuMobile = native as unknown as NonNullable<Window['YiyuMobile']>
    render(<DesktopSenseSettings />)
    fireEvent.click(screen.getByRole('button', { name: '关闭感知' }))
    expect(native.setDesktopSense).toHaveBeenCalledExactlyOnceWith(false)
    expect(screen.getByRole('status')).toHaveTextContent('回到桌面')
  })
  it('fails closed when the native status is missing or malformed', () => {
    window.YiyuMobile = { desktopSenseStatus: () => '{broken' } as unknown as NonNullable<Window['YiyuMobile']>
    render(<DesktopSenseSettings />)
    expect(screen.getByRole('button', { name: '开启桌面停靠' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('新版安卓版')
  })
})
