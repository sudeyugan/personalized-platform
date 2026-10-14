import { fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { bindTrustedLoginPermission } from './trusted-login-permission.js'
let granted, api, checkbox, status
beforeEach(() => {
  granted = false
  api = { permissions: { contains: vi.fn(async () => granted), request: vi.fn(async () => { granted = true; return true }), remove: vi.fn(async () => { granted = false; return true }) } }
  vi.stubGlobal('chrome', api)
  document.body.innerHTML = '<input id="permission" type="checkbox"><small></small>'
  checkbox = document.querySelector('input'); status = document.querySelector('small')
})
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() })
it('does not grant during mount; requests synchronously only on a user change and supports revocation', async () => {
  bindTrustedLoginPermission(checkbox, status)
  await waitFor(() => expect(status.textContent).toContain('默认关闭'))
  expect(api.permissions.request).not.toHaveBeenCalled()
  checkbox.checked = true; fireEvent.change(checkbox)
  expect(api.permissions.request).toHaveBeenCalledExactlyOnceWith({ permissions: ['debugger'] })
  await waitFor(() => expect(checkbox.disabled).toBe(false))
  expect(checkbox.checked).toBe(true)
  checkbox.checked = false; fireEvent.change(checkbox)
  await waitFor(() => expect(checkbox.disabled).toBe(false))
  expect(api.permissions.remove).toHaveBeenCalledExactlyOnceWith({ permissions: ['debugger'] })
  expect(checkbox.checked).toBe(false)
})
it('does not mark a declined grant as enabled', async () => {
  api.permissions.request.mockResolvedValue(false)
  bindTrustedLoginPermission(checkbox, status)
  await waitFor(() => expect(status.textContent).toContain('默认关闭'))
  checkbox.checked = true; fireEvent.change(checkbox)
  await waitFor(() => expect(status.textContent).toContain('未授权'))
  expect(checkbox.checked).toBe(false)
})
