import { describe, expect, it } from 'vitest'
import { normalizeBrowser,browserPageUrl } from './browser'
describe('separate per-site cached login consent',()=>{
  it('does not grant login when normalizing an old/empty browser configuration',()=>{
    expect(normalizeBrowser({enabled:true,sites:['https://mail.example.com']})).toEqual({enabled:true,sites:['https://mail.example.com']})
    expect(normalizeBrowser()).toEqual({enabled:false,sites:[]})
  })
  it('bounds consent to exact currently authorized sites through serialization and revocation',()=>{
    const config={enabled:true,sites:['https://mail.example.com'],cachedLoginSites:['https://mail.example.com','https://mail.example.com','https://evil.example.com']}
    expect(normalizeBrowser(JSON.parse(JSON.stringify(config))).cachedLoginSites).toEqual(['https://mail.example.com'])
    expect(normalizeBrowser({...config,sites:[]}).cachedLoginSites).toBeUndefined()
  })
  it('preserves site roles/entry and independent operation consent, without default grants or domain merging',()=>{
    const config=normalizeBrowser({enabled:true,sites:['https://mails.example.com'],interactionSites:['https://mail.example.com','https://mails.example.com'],profiles:[{origin:'https://mails.example.com',role:'mail',label:'工作邮箱',entryUrl:'https://mails.example.com/inbox'}],preferredSites:{mail:'https://mails.example.com',portal:'https://other.example.com'}})
    expect(config.interactionSites).toEqual(['https://mails.example.com']);expect(config.profiles?.[0].entryUrl).toContain('/inbox')
    expect(normalizeBrowser({...config,sites:[]}).profiles).toBeUndefined()
    expect(config.preferredSites).toEqual({mail:'https://mails.example.com'});expect(normalizeBrowser({...config,sites:[]}).preferredSites).toBeUndefined()
    for(const url of ['https://mail.example.com/','https://mails.example.com/?sid=secret','https://mails.example.com/#token'])expect(()=>browserPageUrl(url,'https://mails.example.com')).toThrow()
  })
})
