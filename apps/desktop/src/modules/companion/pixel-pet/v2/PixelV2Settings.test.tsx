import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createSeedLibrary } from '../../../../domain/seed'
import { useLibraryStore } from '../../../../state/useLibraryStore'
import { readCameraPreferences } from './perception/CameraPreferences'
import { PixelV2Settings } from './PixelV2Settings'
beforeEach(() => { localStorage.clear(); useLibraryStore.setState({ data: createSeedLibrary() }) })
afterEach(cleanup)
it('shows two versions, keeps fine settings folded, and never grants camera when selecting 2.0', () => {
  render(<PixelV2Settings />)
  const group = screen.getByRole('group', { name: '桌宠版本' })
  expect(group.querySelectorAll('button')).toHaveLength(2)
  expect(group.querySelector('button[aria-pressed=true]')?.textContent).toContain('原版')
  expect(screen.getByText('Ctrl + Alt + A')).toBeTruthy()
  fireEvent.click(group.querySelectorAll('button')[1])
  expect(useLibraryStore.getState().data.companion.desktop.pixelEnhancements?.enabled).toBe(true)
  expect(readCameraPreferences().enabled).toBe(false)
  expect(screen.getByRole('checkbox', { name: '开启桌宠本地摄像头感知' })).not.toBeChecked()
  const advanced = screen.getByText('动作与窗口选项').closest('details')!
  expect(advanced.open).toBe(false)
  fireEvent.click(group.querySelectorAll('button')[0])
  expect(useLibraryStore.getState().data.companion.desktop.pixelEnhancements?.enabled).toBe(false)
  expect(screen.queryByRole('checkbox', { name: '开启桌宠本地摄像头感知' })).toBeNull()
})
