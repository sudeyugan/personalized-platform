use crate::browser_bridge::{policy,state::Request};
#[derive(Default,Clone,PartialEq,Eq)]pub struct Config{pub enabled:bool,pub sites:Vec<String>,pub interactions:Vec<String>,pub logins:Vec<String>}
pub fn entry(raw:&str,site:&str)->Result<(),String>{
    let url=reqwest::Url::parse(raw).map_err(|_|"BROWSER_ARGUMENT:")?;
    if policy::origin(&url.origin().ascii_serialization())?!=site||url.query().is_some()||url.fragment().is_some()||!url.username().is_empty()||url.password().is_some()||raw.len()>2048{return Err("BROWSER_ARGUMENT:".into())}Ok(())
}
impl Config{
    pub fn new(enabled:bool,sites:Vec<String>,interactions:Vec<String>)->Result<Self,String>{
        let sites=policy::sites(&sites)?;let interactions=policy::sites(&interactions)?;
        if interactions.iter().any(|site|!sites.contains(site)){return Err("BROWSER_SITE_PERMISSION:".into())}Ok(Self{enabled,sites,interactions,logins:vec![]})
    }
    pub fn with_logins(mut self,sites:Vec<String>)->Result<Self,String>{self.logins=policy::sites(&sites)?;if self.logins.iter().any(|site|!self.sites.contains(site)){return Err("BROWSER_SITE_PERMISSION:".into())}Ok(self)}
    pub fn check(&self,request:&Request)->Result<(),String>{
        if !self.enabled{return Err("BROWSER_DISABLED:".into())}
        if policy::origin(&request.origin)?!=request.origin||!self.sites.contains(&request.origin){return Err("BROWSER_SITE_PERMISSION:".into())}
        if request.cached_login&&(!self.logins.contains(&request.origin)||!["page","observe"].contains(&request.kind.as_str())){return Err("BROWSER_SITE_PERMISSION:".into())}
        if request.query_mode.as_ref().is_some_and(|mode|mode!="background")||request.kind!="act"&&request.interaction.is_some()||request.kind!="ensure"&&request.target_url.is_some(){return Err("BROWSER_ARGUMENT:".into())}
        match request.kind.as_str(){
            "tabs"=>if request.tab_id.is_some(){return Err("BROWSER_ARGUMENT:".into())},
            "ensure"=>{if request.tab_id.is_some(){return Err("BROWSER_ARGUMENT:".into())}entry(request.target_url.as_deref().unwrap_or(&request.origin),&request.origin)?;},
            "page"|"observe"=>if request.tab_id.is_none(){return Err("BROWSER_ARGUMENT:".into())},
            "act"=>{
                if request.tab_id.is_none()||!self.interactions.contains(&request.origin){return Err("BROWSER_SITE_PERMISSION:".into())}
                let action=request.interaction.as_ref().ok_or("BROWSER_ARGUMENT:")?;
                if !["invoke","search","fill","select","scroll"].contains(&action.operation.as_str())||[&action.element_id,&action.observation_id].iter().any(|id|id.len()!=36||!id.bytes().all(|byte|byte.is_ascii_hexdigit()||byte==b'-')){return Err("BROWSER_ARGUMENT:".into())}
                if ["search","fill","select"].contains(&action.operation.as_str())&&action.query.as_ref().is_none_or(|query|query.trim().is_empty()||query.chars().count()>200||query.contains(['\n','\r','\0'])){return Err("BROWSER_ARGUMENT:".into())}
            },
            "followed_live"=>{if request.tab_id.is_some()||request.origin!="https://live.bilibili.com"||["https://api.bilibili.com","https://api.live.bilibili.com"].iter().any(|site|!self.sites.iter().any(|value|value==site)){return Err("BROWSER_SITE_PERMISSION:".into())}},
            _=>return Err("BROWSER_ARGUMENT:".into()),
        }Ok(())
    }
}
#[cfg(test)]mod tests{
    use super::*;
    fn request()->Request{serde_json::from_value(serde_json::json!({"kind":"ensure","origin":"https://example.com"})).unwrap()}
    #[test]fn requests_are_scoped_and_no_cached_credentials(){let config=Config::new(true,vec!["https://example.com".into()],vec![]).unwrap();let mut req=request();assert!(config.check(&req).is_ok());req.cached_login=true;assert!(config.check(&req).is_err());req.cached_login=false;req.target_url=Some("https://example.com/?token=secret".into());assert!(config.check(&req).is_err());req.target_url=None;req.origin="https://other.com".into();assert!(config.check(&req).is_err());}
    #[test]fn interaction_permission_separate(){let config=Config::new(true,vec!["https://example.com".into()],vec![]).unwrap();let mut req=request();req.kind="act".into();req.tab_id=Some(1);assert!(config.check(&req).is_err());assert!(Config::new(true,vec![],vec!["https://example.com".into()]).is_err());}
    #[test]fn login_requires_configured_site_and_page_request(){
        let site="https://example.com".to_string();let config=Config::new(true,vec![site.clone()],vec![]).unwrap();
        let mut req=request();req.kind="observe".into();req.tab_id=Some(1);req.cached_login=true;assert!(config.check(&req).is_err());
        let config=config.with_logins(vec![site]).unwrap();assert!(config.check(&req).is_ok());
        req.kind="tabs".into();req.tab_id=None;assert!(config.check(&req).is_err());
        assert!(Config::new(true,vec![],vec![]).unwrap().with_logins(vec!["https://other.com".into()]).is_err());
    }
}
