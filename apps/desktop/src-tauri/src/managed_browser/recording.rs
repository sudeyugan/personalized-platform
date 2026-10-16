use serde::{Deserialize,Serialize};
use serde_json::{Value,json};
use tauri::{AppHandle,State,WebviewWindow};
use super::{ManagedBrowserRuntime,main_only,execute,policy};

#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct RecordCommand{action:String,origin:Option<String>,url:Option<String>,recording_id:Option<String>}
impl RecordCommand{
    fn check(&self,config:&policy::Config)->Result<(),String>{
        if !config.enabled{return Err("BROWSER_DISABLED:".into())}
        if self.action=="begin"{
            let site=self.origin.as_ref().ok_or("BROWSER_ARGUMENT:")?;
            if !config.sites.contains(site)||self.recording_id.is_some(){return Err("BROWSER_SITE_PERMISSION:".into())}
            policy::entry(self.url.as_deref().ok_or("BROWSER_ARGUMENT:")?,site)?;
        }else{
            if self.origin.is_some()||self.url.is_some()||!["status","pause","resume","stop","cancel"].contains(&self.action.as_str()){return Err("BROWSER_ARGUMENT:".into())}
            if self.action!="status"&&self.recording_id.as_ref().is_none_or(|id|id.len()!=64||!id.bytes().all(|b|b.is_ascii_hexdigit())){return Err("BROWSER_ARGUMENT:".into())}
        }Ok(())
    }
}
fn validate(value:&Value,config:&policy::Config)->Result<(),String>{
    if value.is_null(){return Ok(())}
    let object=value.as_object().ok_or("BROWSER_RESULT:")?;
    if object.len()!=6||object.keys().any(|key|!["id","origin","tabId","phase","events","remainingSeconds"].contains(&key.as_str())){return Err("BROWSER_RESULT:".into())}
    if value["id"].as_str().is_none_or(|id|id.len()!=64||!id.bytes().all(|b|b.is_ascii_hexdigit()))||value["origin"].as_str().is_none_or(|site|!config.sites.iter().any(|s|s==site))||value["tabId"].as_u64().is_none()||value["remainingSeconds"].as_u64().is_none_or(|seconds|seconds>300)||value["phase"].as_str().is_none_or(|phase|!["recording","paused","review"].contains(&phase)){return Err("BROWSER_RESULT:".into())}
    let cues=["inbox","unread","all","notifications","updates","following","next","previous","refresh","search","manual_auth","navigation","unknown_button","unknown_tab"];
    if value["events"].as_array().is_none_or(|events|events.len()>7||events.iter().any(|cue|cue.as_str().is_none_or(|cue|!cues.contains(&cue)))){return Err("BROWSER_RESULT:".into())}Ok(())
}
#[tauri::command]
pub async fn managed_browser_record(app:AppHandle,window:WebviewWindow,runtime:State<'_,ManagedBrowserRuntime>,command:RecordCommand,expected_epoch:u64)->Result<Value,String>{
    main_only(&window)?;
    command.check(&*runtime.inner.config.lock().map_err(|_|"BROWSER_STATE:")?)?;
    let runtime=runtime.inner.clone();
    tauri::async_runtime::spawn_blocking(move||{
        let mut input=serde_json::to_value(command).map_err(|_|"BROWSER_ARGUMENT:")?;input["kind"]=json!("record");
        let value=execute(&app,&runtime,expected_epoch,input)?;
        validate(&value,&*runtime.config.lock().map_err(|_|"BROWSER_STATE:")?)?;Ok(value)
    }).await.map_err(|_|"BROWSER_RUNTIME:".to_string())?
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn recording_is_closed_and_scoped(){
        let config=policy::Config::new(true,vec!["https://example.com".into()],vec![]).unwrap();
        let command=|value|serde_json::from_value::<RecordCommand>(value).unwrap();
        assert!(command(json!({"action":"begin","origin":"https://example.com","url":"https://example.com/inbox"})).check(&config).is_ok());
        for value in [json!({"action":"begin","origin":"https://other.com","url":"https://other.com"}),json!({"action":"begin","origin":"https://example.com","url":"https://example.com/?token=x"}),json!({"action":"event"})]{assert!(command(value).check(&config).is_err())}
        assert!(serde_json::from_value::<RecordCommand>(json!({"action":"status","text":"private"})).is_err());
        let valid=json!({"id":"a".repeat(64),"origin":"https://example.com","tabId":1,"phase":"review","events":["unread"],"remainingSeconds":20});assert!(validate(&valid,&config).is_ok());
        let mut bad=valid;bad["events"]=json!(["private text"]);assert!(validate(&bad,&config).is_err());
    }
}
