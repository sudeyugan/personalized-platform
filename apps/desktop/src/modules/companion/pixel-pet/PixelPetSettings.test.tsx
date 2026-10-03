import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PixelPetSettings } from './PixelPetSettings'

const store = vi.hoisted(() => ({ enabled: true, mode: 'interactive', setCompanionPixelPet: vi.fn(), setCompanionDesktopMode: vi.fn() }))
vi.mock('../../../state/useLibraryStore', () => ({
  useLibraryStore: () => ({ data: { companion: { desktop: { pixelPetEnabled: store.enabled, mode: store.mode } } }, setCompanionPixelPet: store.setCompanionPixelPet, setCompanionDesktopMode: store.setCompanionDesktopMode }),
}))
vi.mock('./PixelPetRenderer', () => ({ PixelPetRenderer: () => <canvas data-testid="pet-preview" /> }))

describe('pixel pet development settings', () => {
  beforeEach(() => { store.enabled = true; store.mode = 'interactive'; vi.clearAllMocks() })
  it('mounts the animated preview only while the details are open', () => {
    const { container } = render(<PixelPetSettings />)
    expect(screen.queryByTestId('pet-preview')).not.toBeInTheDocument()
    const details = container.querySelector('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(screen.getByTestId('pet-preview')).toBeInTheDocument()
    details.open = false
    fireEvent(details, new Event('toggle'))
    expect(screen.queryByTestId('pet-preview')).not.toBeInTheDocument()
  })
  it('explains click-through and provides a visible way to enable dragging', () => {
    store.mode = 'quiet'
    render(<PixelPetSettings />)
    expect(screen.getByText('穿透模式不会接收拖动或点击。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '开启鼠标互动' }))
    expect(store.setCompanionDesktopMode).toHaveBeenCalledWith('interactive')
  })
  it('provides an explicit reversible mode switch without changing the asset configuration', () => {
    render(<PixelPetSettings />)
    fireEvent.change(screen.getByRole('combobox', { name: '伙伴渲染模式' }), { target: { value: 'webm' } })
    expect(store.setCompanionPixelPet).toHaveBeenCalledWith(false)
    fireEvent.change(screen.getByRole('combobox', { name: '伙伴渲染模式' }), { target: { value: 'pixel-pet' } })
    expect(store.setCompanionPixelPet).toHaveBeenLastCalledWith(true)
  })
})
