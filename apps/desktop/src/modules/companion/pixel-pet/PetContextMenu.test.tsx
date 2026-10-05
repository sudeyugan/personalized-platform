import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PetContextMenu } from './PetContextMenu'
function fixture() {
  const callbacks = { onAction: vi.fn(), onPose: vi.fn(), onClose: vi.fn() }
  render(<PetContextMenu point={{ x: 9999, y: 9999 }} style="chibi" pose="float" {...callbacks} />)
  return callbacks
}
describe('compact pet context menu', () => {
  it('selects style and pose without invoking chat or drag', () => {
    const f = fixture()
    fireEvent.click(screen.getByRole('menuitem', { name: /切换造型/ }))
    expect(screen.getByRole('menuitemradio', { name: /Q 版/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: '像素半身' }))
    expect(f.onAction).toHaveBeenCalledWith({ kind: 'style', value: 'pixel' })
    expect(f.onClose).toHaveBeenCalledTimes(1)
  })
  it('supports free placement and bottom pose', () => {
    const f = fixture()
    fireEvent.click(screen.getByRole('menuitem', { name: /摆放姿态/ }))
    expect(screen.getByRole('menuitemradio', { name: /自然放置/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: '底部趴边' }))
    expect(f.onPose).toHaveBeenCalledWith('bottom-edge')
  })
  it('cycles keyboard focus, closes with Escape or outside click', () => {
    const f = fixture(), menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: '暂时隐藏' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Tab' })
    expect(screen.getByRole('menuitem', { name: /切换造型/ })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(f.onClose).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(document.body)
    expect(f.onClose).toHaveBeenCalledTimes(2)
  })
})
