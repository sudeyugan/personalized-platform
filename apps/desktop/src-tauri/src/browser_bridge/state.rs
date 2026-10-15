use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use super::policy;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Pair { pub token: String, pub origin: String }
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request { pub kind: String, pub origin: String, pub tab_id: Option<u64>, #[serde(default)] pub cached_login: bool, pub target_url:Option<String>, pub interaction:Option<Interaction> }
#[derive(Clone,Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Interaction {pub observation_id:String,pub element_id:String,pub operation:String,pub query:Option<String>}
#[derive(Clone)]
pub struct Job { pub id: String, pub request: Request, pub epoch: u64, pub expires: Instant, pub sent: bool }
pub struct BridgeState {
    pub enabled: bool, pub sites: Vec<String>, pub cached_login_sites: Vec<String>, pub interaction_sites:Vec<String>, pub pair: Option<Pair>, pub pending_pair: Option<(String, Instant)>,
    pub last_seen: Option<Instant>, pub reported_sites: Vec<String>, pub job: Option<Job>, pub reply: Option<Result<Value, String>>, pub epoch: u64,
    pub extension_version: Option<String>, pub extension_revision:Option<String>, pub extension_path: Option<String>, pub setup: Option<super::maintenance::Setup>,
    pub recording:Option<super::recording::Recording>,
}
impl Default for BridgeState {
    fn default() -> Self { Self { enabled: false, sites: vec![], cached_login_sites: vec![], interaction_sites:vec![], pair: None, pending_pair: None, last_seen: None, reported_sites: vec![], job: None, reply: None, epoch: 0, extension_version:None, extension_revision:None, extension_path:None, setup:None,recording:None } }
}
impl BridgeState {
    pub fn cancel(&mut self) { self.epoch = self.epoch.wrapping_add(1); self.job = None; self.reply = None; self.setup = None; self.recording=None; }
    pub fn check_pair(&self, code: &str) -> Result<(), String> {
        if !self.enabled || self.pair.is_some() { return Err("BROWSER_PAIR:连接未开启或已绑定".into()); }
        if !self.pending_pair.as_ref().is_some_and(|(token,time)| time.elapsed() < Duration::from_secs(600) && policy::equal_secret(token,code)) { return Err("BROWSER_PAIR:连接码不正确或已到期".into()); }
        Ok(())
    }
    pub fn status(&self) -> Value {
        json!({"enabled": self.enabled, "paired": self.pair.is_some(), "online": self.enabled && self.pair.is_some() && self.last_seen.is_some_and(|time| time.elapsed() < Duration::from_secs(12)), "sites": self.sites, "browserSites": self.reported_sites, "epoch":self.epoch, "extensionVersion":self.extension_version, "expectedVersion":super::assets::version(), "extensionPath":self.extension_path, "updateRequired":self.pair.is_some() && !self.compatible(), "setupPending":self.setup.as_ref().is_some_and(|setup| setup.epoch == self.epoch && setup.expires > Instant::now())})
    }
    pub fn authorised(&self, site: &str) -> bool { self.enabled && self.pair.is_some() && self.sites.iter().any(|item| item == site) && self.reported_sites.iter().any(|item| item == site) }
    pub fn check(&self, request: &Request) -> Result<(), String> {
        if self.recording.as_ref().is_some_and(|r|r.phase!=super::recording::Phase::Review){return Err("BROWSER_BUSY:正在示范录制，请先停止或取消示范".into())}
        if !self.enabled { return Err("BROWSER_DISABLED:请在AI伙伴设置中开启浏览器连接".into()); }
        if self.pair.is_none() { return Err("BROWSER_NOT_CONNECTED:请先一次性安装并连接Edge扩展；浏览器已登录不等于连接已完成".into()); }
        if !self.compatible() { return Err("BROWSER_UPDATE_REQUIRED:扩展需要完成更新后才能读取；旧版本本次需在Edge重新加载一次".into()); }
        let site = policy::origin(&request.origin)?;
        if !self.authorised(&site) { return Err("BROWSER_SITE_PERMISSION:这个网站尚未同时在一隅和Edge扩展中授权，或授权已撤销".into()); }
        if request.cached_login && (!["page","observe"].contains(&request.kind.as_str()) || !self.cached_login_sites.contains(&site)) { return Err("BROWSER_SITE_PERMISSION:本次网站没有另行授权已填凭据登录".into()); }
        if request.kind!="ensure" && request.target_url.is_some() || request.kind!="act" && request.interaction.is_some(){return Err("BROWSER_ARGUMENT:动作参数不属于本次工具".into())}
        match request.kind.as_str() {
            "tabs" => { if request.tab_id.is_some() { return Err("BROWSER_ARGUMENT:标签页列表不接受旧标签页ID".into()); } },
            "page" | "observe" => { if request.tab_id.is_none() { return Err("BROWSER_ARGUMENT:请从本次标签页列表选取ID".into()); } },
            "ensure" => {
                if request.tab_id.is_some(){return Err("BROWSER_ARGUMENT:准备页面不接受旧ID".into())}
                let url=reqwest::Url::parse(request.target_url.as_deref().unwrap_or(&site)).map_err(|_|"BROWSER_ARGUMENT:无效入口")?;
                if url.origin().ascii_serialization()!=site||url.scheme()!="https"||!url.username().is_empty()||url.password().is_some()||url.query().is_some()||url.fragment().is_some()||url.port().is_some()||url.as_str().len()>2048{return Err("BROWSER_ARGUMENT:只可准备本次同站点无认证参数页面".into())}
            },
            "act" => {
                if request.tab_id.is_none()||!self.interaction_sites.contains(&site){return Err("BROWSER_SITE_PERMISSION:本网站没有另行授权页面导航与检索".into())}
                let action=request.interaction.as_ref().ok_or("BROWSER_ARGUMENT:缺少现场控件")?;
                if ![&action.observation_id,&action.element_id].iter().all(|id|id.len()==36&&id.bytes().all(|b|b.is_ascii_hexdigit()||b==b'-'))||!["invoke","search"].contains(&action.operation.as_str())||action.query.as_ref().is_some_and(|text|text.is_empty()||text.chars().count()>200||text.chars().any(char::is_control))||action.operation=="invoke"&&action.query.is_some()||action.operation=="search"&&action.query.is_none(){return Err("BROWSER_ARGUMENT:无效现场动作，不接受任意脚本".into())}
            },
            "followed_live" if site == "https://live.bilibili.com" && request.tab_id.is_none() => {
                for required in ["https://api.bilibili.com", "https://api.live.bilibili.com"] { if !self.authorised(required) { return Err("BROWSER_SITE_PERMISSION:B站关注直播还需授权B站的两个官方只读接口域名".into()); } }
            },
            _ => return Err("BROWSER_ARGUMENT:未接入的浏览器动作，不允许任意脚本、HTTP或写入".into()),
        }
        Ok(())
    }
    pub fn authenticate(&self, origin: &str, token: &str) -> Result<(), String> {
        if self.pair.as_ref().is_some_and(|pair| pair.origin == origin && policy::equal_secret(&pair.token, token)) { Ok(()) } else { Err("BROWSER_AUTH:连接已失效，请重新连接".into()) }
    }
    pub fn poll(&mut self, reported: Vec<String>) -> Value {
        self.last_seen = Some(Instant::now());
        if self.reported_sites != reported { self.reported_sites = reported; if self.job.as_ref().is_some_and(|job| self.check(&job.request).is_err())||self.recording.as_ref().is_some_and(|r|!self.authorised(&r.origin)){ self.cancel(); } }
        if self.job.as_ref().is_some_and(|job| job.expires <= Instant::now()) { self.cancel(); }
        let allowed = self.job.as_ref().is_some_and(|job| !job.sent && self.check(&job.request).is_ok());
        let job = if allowed { let job = self.job.as_mut().unwrap(); job.sent = true; json!({"id":job.id,"kind":job.request.kind,"origin":job.request.origin,"tabId":job.request.tab_id,"cachedLogin":job.request.cached_login,"targetUrl":job.request.target_url,"interaction":job.request.interaction}) } else { Value::Null };
        json!({"job": job, "maintenance": self.maintenance(),"recording":self.recording_lease()})
    }
    #[cfg(test)]
    pub fn active_login(&self, id: &str) -> bool {
        self.active_job(id)&&self.job.as_ref().is_some_and(|job|job.request.cached_login)
    }
    pub fn active_job(&self,id:&str)->bool {
        self.reply.is_none() && self.job.as_ref().is_some_and(|job| job.id == id && job.sent && job.epoch == self.epoch && job.expires > Instant::now() && self.check(&job.request).is_ok())
    }
}
