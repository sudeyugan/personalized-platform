import { beforeEach,expect,it,vi } from 'vitest'
import { render,screen,fireEvent,waitFor } from '@testing-library/react'
import { createSeedLibrary } from '../../../domain/seed'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { BrowserConnectionSection } from '../BrowserConnectionSection'
const native=vi.hoisted(()=>vi.fn())
vi.mock('../native',()=>({browserNative:native,configureBrowser:vi.fn()}))
vi.mock('../../../infrastructure/libraryRepository',()=>({libraryRepository:{save:vi.fn(async()=>{})}}))
beforeEach(()=>{native.mockReset();native.mockResolvedValue({epoch:4,mode:'background'});const data=createSeedLibrary();data.companion.browser={enabled:true,backend:'managed',sites:[]};useLibraryStore.setState({data})})
it('adds a clean entry in one place, infers mail purpose and never automatically opens a window',async()=>{
  render(<BrowserConnectionSection/>);expect(native).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox',{name:'专用浏览器授权网站'}),{target:{value:'https://mails.example.com/inbox'}})
  fireEvent.click(screen.getByRole('button',{name:'添加并授权浏览'}))
  await waitFor(()=>expect(useLibraryStore.getState().data.companion.browser).toMatchObject({sites:['https://mails.example.com'],interactionSites:['https://mails.example.com'],profiles:[{origin:'https://mails.example.com',role:'mail',entryUrl:'https://mails.example.com/inbox'}]}))
  expect(native).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'登录'}))
  await waitFor(()=>expect(native).toHaveBeenCalledWith('managed_browser_login',{origin:'https://mails.example.com',url:'https://mails.example.com/inbox',expectedEpoch:4}))
  fireEvent.click(await screen.findByRole('button',{name:'结束登录 · 转为后台'}))
  await waitFor(()=>expect(native).toHaveBeenCalledWith('managed_browser_finish_login',{expectedEpoch:4}))
})
it('preserves the site list when switching compatibility backend and only clears auth after explicit confirmation',async()=>{
  const origin='https://mails.example.com';useLibraryStore.getState().data.companion.browser!.sites=[origin]
  render(<BrowserConnectionSection/>)
  fireEvent.click(screen.getByRole('button',{name:'清除专用浏览器登录'}))
  expect(screen.getByRole('dialog')).toBeInTheDocument();expect(native).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'先保留'}));expect(native).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'清除专用浏览器登录'}));fireEvent.click(screen.getByRole('button',{name:'确认清除'}))
  await waitFor(()=>expect(native).toHaveBeenCalledWith('managed_browser_clear_session',{confirmed:true}))
  expect(useLibraryStore.getState().data.companion.browser!.sites).toEqual([origin])
  fireEvent.click(screen.getByRole('button',{name:/现有 Edge 扩展/}));expect(useLibraryStore.getState().data.companion.browser!.backend).toBeUndefined()
  expect(useLibraryStore.getState().data.companion.browser!.sites).toEqual([origin])
})
