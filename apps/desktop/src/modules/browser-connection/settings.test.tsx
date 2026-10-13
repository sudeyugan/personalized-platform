import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserConnectionSection } from './BrowserConnectionSection'
import { OperationMemoryPanel } from '../operation-memory/OperationMemoryPanel'
import { openOperationMemory } from '../operation-memory/events'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
const native=vi.hoisted(()=>vi.fn())
const configure=vi.hoisted(()=>vi.fn())
vi.mock('./native',()=>({browserNative:native,configureBrowser:configure}))
vi.mock('../../infrastructure/libraryRepository',()=>({libraryRepository:{save:vi.fn(async()=>{})}}))
beforeEach(()=>{native.mockReset();configure.mockReset();useLibraryStore.setState({data:createSeedLibrary(),saveStatus:'idle'})})
afterEach(()=>vi.unstubAllGlobals())
describe('explicit connection and learning UI',()=>{
  it('does not silently enable, export, connect or read; keeps first install and explicit site selection',async()=>{
    render(<BrowserConnectionSection/>);expect(screen.getByRole('button',{name:'允许读取已登录浏览器'})).toHaveAttribute('aria-pressed','false');expect(native).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'允许读取已登录浏览器'}))
    expect(screen.getByText(/开发人员模式/u)).toBeInTheDocument();expect(native).not.toHaveBeenCalled()
    expect(screen.queryByRole('button',{name:'连接B站（直播与动态）'})).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox',{name:'授权网站域名'}),{target:{value:'mails.example.com'}})
    fireEvent.click(screen.getByRole('button',{name:'添加并连接'}));expect(useLibraryStore.getState().data.companion.browser?.sites).toEqual(['https://mails.example.com'])
    await screen.findByText(/网站已保存/u);expect(native).not.toHaveBeenCalled()
  })
  it('adds a site only here, requests the fixed Edge confirmation, and respects not opening the website',async()=>{
    vi.stubGlobal('__TAURI_INTERNALS__',{})
    const data=useLibraryStore.getState().data;data.companion.browser={enabled:true,sites:[]};data.companion.permissions.internet=true;data.settings.trust.externalAiProcessing=true
    native.mockResolvedValue({enabled:true,paired:true,online:true,sites:[],browserSites:[],epoch:1,expectedVersion:'0.2.0',extensionVersion:'0.2.0'})
    render(<BrowserConnectionSection/>);await waitFor(()=>expect(native).toHaveBeenCalledWith('browser_bridge_status'))
    fireEvent.click(screen.getByRole('checkbox',{name:'连接后打开目标网站'}))
    fireEvent.change(screen.getByRole('textbox',{name:'授权网站域名'}),{target:{value:'https://mail.example.com'}})
    fireEvent.click(screen.getByRole('button',{name:'添加并连接'}))
    await waitFor(()=>expect(native).toHaveBeenCalledWith('browser_bridge_setup',{sites:['https://mail.example.com'],openOrigin:null}))
    expect(useLibraryStore.getState().data.companion.browser?.sites).toEqual(['https://mail.example.com'])
    expect(configure).toHaveBeenCalledWith(true,['https://mail.example.com'],false,[],[])
    expect(native.mock.calls.some(([name])=>name==='browser_bridge_request')).toBe(false)
  })
  it('keeps login consent off for old sites and removes it when the site is revoked',()=>{
    const data=useLibraryStore.getState().data;data.companion.browser={enabled:true,sites:['https://mail.example.com']}
    render(<BrowserConnectionSection/>)
    fireEvent.click(screen.getByText('网站选项'))
    const checkbox=screen.getByRole('checkbox',{name:'允许 mail.example.com 用已填凭据登录'})
    expect(checkbox).not.toBeChecked();fireEvent.click(checkbox)
    expect(useLibraryStore.getState().data.companion.browser?.cachedLoginSites).toEqual(['https://mail.example.com']);expect(native).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'撤销 https://mail.example.com'}))
    expect(useLibraryStore.getState().data.companion.browser?.cachedLoginSites).toBeUndefined()
  })
  it('configures a generic site role/name and independent read-navigation permission in one place',()=>{
    const data=useLibraryStore.getState().data;data.companion.browser={enabled:true,sites:['https://portal.example.com']}
    render(<BrowserConnectionSection/>)
    fireEvent.click(screen.getByText('网站选项'))
    fireEvent.change(screen.getByRole('combobox',{name:'portal.example.com 网站用途'}),{target:{value:'portal'}})
    const label=screen.getByRole('textbox',{name:'portal.example.com 网站称呼'});fireEvent.change(label,{target:{value:'学校门户'}});fireEvent.blur(label)
    expect(useLibraryStore.getState().data.companion.browser?.profiles?.[0]).toMatchObject({role:'portal',label:'学校门户'})
    const checkbox=screen.getByRole('checkbox',{name:'允许 portal.example.com 页面导航与检索'});expect(checkbox).not.toBeChecked();fireEvent.click(checkbox)
    expect(useLibraryStore.getState().data.companion.browser?.interactionSites).toEqual(['https://portal.example.com'])
    expect(useLibraryStore.getState().data.companion.browser?.cachedLoginSites).toBeUndefined();expect(native).not.toHaveBeenCalled()
  })
  it('allows learning to be turned off and automatic notice goes straight to the library, not a form',()=>{
    render(<OperationMemoryPanel/>);act(()=>window.dispatchEvent(new CustomEvent('yiyu:operation-training',{detail:{learnedTitle:'查看待办'}})))
    fireEvent.click(screen.getByRole('button',{name:'查看方法'}));expect(screen.queryByText('核对并保存方法')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox',{name:'成功操作后自动学习'}));expect(useLibraryStore.getState().data.companion.operationLearning?.enabled).toBe(false)
    act(()=>openOperationMemory({mode:'library'}));expect(screen.getByRole('button',{name:'手动补充'})).toBeInTheDocument()
  })
  it('keeps learned default bindings cancellable even for a custom general website',()=>{
    const data=useLibraryStore.getState().data;data.companion.browser={enabled:true,sites:['https://custom.example.com'],profiles:[{origin:'https://custom.example.com',role:'general'}],preferredSites:{mail:'https://custom.example.com'}}
    render(<BrowserConnectionSection/>);fireEvent.click(screen.getByText('网站选项'))
    const checkbox=screen.getByRole('checkbox',{name:'custom.example.com 默认查询网站'});expect(checkbox).toBeChecked();fireEvent.click(checkbox)
    expect(useLibraryStore.getState().data.companion.browser?.preferredSites).toBeUndefined()
    expect(useLibraryStore.getState().data.companion.browser?.sites).toEqual(['https://custom.example.com'])
  })
  it('connects only already added pending websites, never expands to a special provider',async()=>{
    vi.stubGlobal('__TAURI_INTERNALS__',{})
    const data=useLibraryStore.getState().data;data.companion.browser={enabled:true,sites:['https://live.bilibili.com','https://mails.example.com']};data.settings.trust.externalAiProcessing=true
    native.mockResolvedValue({enabled:true,paired:true,online:true,browserSites:['https://live.bilibili.com'],epoch:1})
    render(<BrowserConnectionSection/>);await waitFor(()=>expect(screen.getByText('Edge 已在线')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button',{name:'连接已添加网站'}))
    await waitFor(()=>expect(native).toHaveBeenCalledWith('browser_bridge_setup',{sites:['https://mails.example.com'],openOrigin:'https://mails.example.com'}))
    expect(useLibraryStore.getState().data.companion.browser?.sites).toEqual(['https://live.bilibili.com','https://mails.example.com'])
    expect(screen.getAllByText('网站选项').every(item=>!item.closest('details')?.open)).toBe(true)
  })
})
