use std::time::{Duration, Instant};
use serde::Deserialize;
use serde_json::{json, Value};
use super::{assets, policy, state::BridgeState};

#[derive(Clone)]
pub struct Setup { pub id:String, pub sites:Vec<String>, pub open_origin:Option<String>, pub epoch:u64, pub expires:Instant, pub sent:bool }
#[derive(Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct SetupReply { pub id:String, pub action:String, pub sites:Option<Vec<String>> }
impl Setup {
    fn public(&self) -> Value { json!({"id":self.id,"sites":self.sites,"openOrigin":self.open_origin,"epoch":self.epoch}) }
}
impl BridgeState {
    pub fn compatible(&self) -> bool { self.extension_path.is_some() && self.extension_version.as_deref() == Some(assets::version()) && self.extension_revision.as_deref()==Some(assets::revision()) }
    pub fn report_revision(&mut self, revision:Option<String>) -> Result<(), String> {
        if revision.as_ref().is_some_and(|value| value!="development" && (value.len()!=64 || !value.bytes().all(|b| b.is_ascii_hexdigit()))) { return Err("BROWSER_ARGUMENT:无效扩展内容标记".into()); }
        if self.extension_revision!=revision { self.cancel();self.extension_revision=revision; }Ok(())
    }
    pub fn report_version(&mut self, version:Option<String>) -> Result<(), String> {
        if version.as_ref().is_some_and(|value| value.len()>32 || value.is_empty() || value.split('.').any(|part| part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit()))) { return Err("BROWSER_ARGUMENT:无效扩展版本".into()); }
        if self.extension_version != version { self.cancel(); self.extension_version = version; }
        Ok(())
    }
    pub fn maintenance(&mut self) -> Value {
        if self.setup.as_ref().is_some_and(|setup| !self.enabled || setup.epoch != self.epoch || setup.expires <= Instant::now()) { self.setup = None; }
        let setup = self.setup.as_mut().filter(|setup| !setup.sent).map(|setup| { setup.sent=true; setup.public() });
        json!({"version":assets::version(),"revision":assets::revision(),"ready":self.extension_path.is_some(),"enabled":self.enabled,"sites":self.sites,"epoch":self.epoch,"setup":setup})
    }
    pub fn request_setup(&mut self, id:String, sites:Vec<String>, open_origin:Option<String>) -> Result<(), String> {
        if !self.enabled || self.pair.is_none() { return Err("BROWSER_NOT_CONNECTED:请先开启并配对Edge".into()); }
        if !self.compatible() { return Err("BROWSER_UPDATE_REQUIRED:旧扩展需本次重新加载一次，之后可自动更新".into()); }
        if self.setup.as_ref().is_some_and(|setup| setup.epoch==self.epoch && setup.expires>Instant::now()) { return Err("BROWSER_BUSY:已有网站确认尚未结束，请先确认或取消".into()); }
        let sites = policy::sites(&sites)?;
        if sites.is_empty() || sites.iter().any(|site| !self.sites.contains(site)) { return Err("BROWSER_SITE_PERMISSION:设置请求只能包含在一隅明确添加的网站".into()); }
        if open_origin.as_ref().is_some_and(|origin| !sites.contains(origin) || policy::origin(origin).as_deref()!=Ok(origin.as_str())) { return Err("BROWSER_ARGUMENT:只可打开本次明确添加的精确域名".into()); }
        self.setup=Some(Setup{id,sites,open_origin,epoch:self.epoch,expires:Instant::now()+Duration::from_secs(180),sent:false}); Ok(())
    }
    pub fn setup_reply(&mut self, reply:SetupReply) -> Result<Value, String> {
        let setup = self.setup.clone().filter(|setup| self.enabled && self.pair.is_some() && self.compatible() && setup.id==reply.id && setup.sent && setup.epoch==self.epoch && setup.expires>Instant::now() && setup.sites.iter().all(|site| self.sites.contains(site))).ok_or("BROWSER_STALE:设置已停止、改变或过期，请从一隅重新连接网站")?;
        match reply.action.as_str() {
            "inspect" if reply.sites.is_none() => Ok(setup.public()),
            "cancel" if reply.sites.is_none() => { self.setup=None; Ok(json!({"cancelled":true})) },
            "complete" => {
                let reported=policy::sites(&reply.sites.ok_or("BROWSER_ARGUMENT:缺少实际授权")?)?;
                if !setup.sites.iter().all(|site| reported.contains(site)) { return Err("BROWSER_SITE_PERMISSION:Edge尚未实际授权全部本次网站".into()); }
                self.reported_sites=reported; self.setup=None;
                Ok(json!({"completed":true,"openOrigin":setup.open_origin}))
            },
            _ => Err("BROWSER_ARGUMENT:无效设置动作".into()),
        }
    }
}
