import { fireEvent, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CompanionNameSetting } from './CompanionNameSetting'

it('commits one name on blur/enter rather than restarting wake per keystroke', () => {
  const change = vi.fn()
  const { getByRole, rerender } = render(<CompanionNameSetting name="小鱼" onChange={change} />)
  const input = getByRole('textbox')
  fireEvent.change(input, { target: { value: '阿' } })
  expect(change).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: '阿璃' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(change).toHaveBeenCalledWith('阿璃')
  rerender(<CompanionNameSetting name="阿璃" onChange={change} />)
  fireEvent.change(input, { target: { value: '未保存' } })
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(input).toHaveValue('阿璃')
  fireEvent.blur(input)
  expect(change).toHaveBeenCalledTimes(1)
})
