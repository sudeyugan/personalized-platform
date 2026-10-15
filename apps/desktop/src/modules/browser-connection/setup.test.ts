import {beforeEach,describe,expect,it,vi} from 'vitest'
import {createSeedLibrary} from '../../domain/seed'
import {useLibraryStore} from '../../state/useLibraryStore'
import {connectBrowserSites} from './setup'
const calls=vi.hoisted(()=>({native:vi.fn(),configure:vi.fn()}))
vi.mock('./native',()=>({browserNative:calls.native,configureBrowser:calls.configure}))
beforeEach(()=>{calls.native.mockReset();calls.configure.mockReset();const data=createSeedLibrary();data.companion.browser={enabled:true,sites:['https://mail.example.com']};data.companion.permissions.internet=true;data.settings.trust.externalAiProcessing=true;useLibraryStore.setState({data})})
describe('settings-only exact website connection',()=>{
  it('queues only selected saved sites and an explicit opening choice',async()=>{
    calls.native.mockResolvedValue({setupPending:true});await connectBrowserSites(['https://mail.example.com'],'https://mail.example.com')
    expect(calls.native).toHaveBeenCalledWith('browser_bridge_setup',{sites:['https://mail.example.com'],openOrigin:'https://mail.example.com'})
    await connectBrowserSites(['https://mail.example.com']);expect(calls.native).toHaveBeenLastCalledWith('browser_bridge_setup',{sites:['https://mail.example.com'],openOrigin:null})
  })
  it('does not discover or approve other websites, wildcard/path/credential targets or closed authority',async()=>{
    for(const sites of [[],['https://other.example.com'],['https://*.example.com'],['https://user:password@mail.example.com']])await expect(connectBrowserSites(sites)).rejects.toThrow()
    await expect(connectBrowserSites(['https://mail.example.com'],'https://mail.example.com/path')).rejects.toThrow()
    useLibraryStore.getState().data.companion.browser!.enabled=false;await expect(connectBrowserSites(['https://mail.example.com'])).rejects.toThrow('先开启')
    expect(calls.native).not.toHaveBeenCalled()
  })
  it('can connect for local demonstration without authorising AI processing',async()=>{
    useLibraryStore.getState().data.settings.trust.externalAiProcessing=false
    await connectBrowserSites(['https://mail.example.com'])
    expect(calls.configure).toHaveBeenCalledWith(true,['https://mail.example.com'],false,[],[])
  })
  it('does not queue a late request after settings change during native configuration',async()=>{
    calls.configure.mockImplementation(async()=>{useLibraryStore.getState().data.companion.browser!.sites=[]})
    await expect(connectBrowserSites(['https://mail.example.com'])).rejects.toThrow('已变化');expect(calls.native).not.toHaveBeenCalled()
  })
})
