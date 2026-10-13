import type { BrowserSiteProfile, BrowserSiteRole } from '../../domain/browser'

export function isMailHost(host:string) {
  return /(?:^|\.)(?:mails?|webmail|email|owa|exmail)(?:\.|$)/iu.test(host)
    || /^(?:outlook\.(?:live|office|office365|cloud\.microsoft)\.com|outlook\.com|gmail\.com|qiye\.aliyun\.com|(?:qy|email)\.163\.com)$/iu.test(host)
}
/** Display inference does not persist metadata or grant any permissions. */
export function websiteRole(site:string,profile?:BrowserSiteProfile):BrowserSiteRole {
  return profile?.role??(isMailHost(new URL(site).hostname)?'mail':'general')
}
