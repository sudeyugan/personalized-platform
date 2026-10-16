import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { createSeedLibrary } from '../../../domain/seed'
import { armBrowserHandoff,cancelBrowserHandoff,receiveBrowserHandoff,resumeAfterLogin } from './handoff'
const site='https://mail.example.com'
beforeEach(()=>{useLibraryStore.setState({data:createSeedLibrary()});cancelBrowserHandoff()})
afterEach(()=>{cancelBrowserHandoff();vi.useRealTimers()})
it('only resumes the current same-site goal once in its original channel',()=>{
  const receive=vi.fn(()=>true),off=receiveBrowserHandoff('desktop',receive)
  armBrowserHandoff('desktop','查看我的未读邮件',site,8)
  expect(resumeAfterLogin('https://other.com',8)).toBe(false)
  expect(resumeAfterLogin(site,8)).toBe(true)
  expect(receive).toHaveBeenCalledExactlyOnceWith('查看我的未读邮件')
  expect(resumeAfterLogin(site,8)).toBe(false);off()
})
it('does not resume after cancellation, authority change, epoch change or expiry',()=>{
  vi.useFakeTimers();const receive=vi.fn(()=>true),off=receiveBrowserHandoff('main',receive)
  armBrowserHandoff('main','查邮件',site,8);cancelBrowserHandoff();expect(resumeAfterLogin(site,8)).toBe(false)
  armBrowserHandoff('main','查邮件',site,8);useLibraryStore.getState().data.settings.trust.externalAiProcessing=true;expect(resumeAfterLogin(site,8)).toBe(false)
  armBrowserHandoff('main','查邮件',site,8);expect(resumeAfterLogin(site,9)).toBe(false)
  armBrowserHandoff('main','查邮件',site,8);vi.advanceTimersByTime(300001);expect(resumeAfterLogin(site,8)).toBe(false)
  off();expect(receive).not.toHaveBeenCalled()
})
it('waits for the original UI after login without opening a window or sending in the background',()=>{
  const receive=vi.fn(()=>true),off=receiveBrowserHandoff('main',receive)
  armBrowserHandoff('main','查邮件',site,8);off();expect(resumeAfterLogin(site,8)).toBe(false);expect(receive).not.toHaveBeenCalled()
  const again=receiveBrowserHandoff('main',receive);expect(receive).toHaveBeenCalledExactlyOnceWith('查邮件');again()
})
it('never queues credential-like messages and does not keep a busy or missing receiver task',()=>{
  const receive=vi.fn(()=>false),off=receiveBrowserHandoff('main',receive)
  for(const goal of ['密码是hidden','password=hidden','查https://mail.example.com/?token=hidden']){armBrowserHandoff('main',goal,site,8);expect(resumeAfterLogin(site,8)).toBe(false)}
  expect(receive).not.toHaveBeenCalled();armBrowserHandoff('main','查邮件',site,8);expect(resumeAfterLogin(site,8)).toBe(false);expect(resumeAfterLogin(site,8)).toBe(false);expect(receive).toHaveBeenCalledTimes(1);off()
})
