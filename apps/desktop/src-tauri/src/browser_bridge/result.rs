use serde::{Deserialize, Serialize};
use serde_json::Value;
use super::{policy, state::Request};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Tab { tab_id: u64, origin: String, title: String, url: String }
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Link { text: String, url: String }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Page { tab_id: u64, origin: String, title: String, url: String, text: String, links: Vec<Link>, truncated: bool, loading: bool, #[serde(default, skip_serializing_if="Option::is_none")] login_state: Option<LoginState>,#[serde(default,skip_serializing_if="Option::is_none")] observation_id:Option<String>,#[serde(default,skip_serializing_if="Vec::is_empty")] controls:Vec<Control> }
#[derive(Deserialize,Serialize)]
#[serde(deny_unknown_fields)]
struct Control {id:String,name:String,operation:String}
#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Action {tab_id:u64,origin:String,action_status:String}
#[derive(Deserialize, Serialize)]
#[serde(rename_all="snake_case")]
enum LoginState { NotAllowed, Unfilled, NeedsUser, Continued, Pending, SubmitRejected }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Room { uid: u64, room_id: u64, name: String, title: String, live_status: u8 }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Followed { logged_in: bool, rooms: Vec<Room>, complete: bool, checked: u64, total: Option<u64> }
fn text(value: &str, max: usize) -> bool { value.chars().count() <= max && !value.contains('\0') && !value.contains("-----BEGIN") }
fn safe_url(raw: &str, expected: Option<&str>) -> bool {
    let Ok(url) = reqwest::Url::parse(raw) else { return false; };
    policy::origin(&url.origin().ascii_serialization()).is_ok() && url.query().is_none() && url.fragment().is_none() && url.username().is_empty() && url.password().is_none() && expected.is_none_or(|site| url.origin().ascii_serialization() == site)
}
pub fn validate(request: &Request, value: Value) -> Result<Value, String> {
    let invalid = "BROWSER_RESULT:浏览器结果格式或当前页面身份不一致，不能视为完成";
    let data = match request.kind.as_str() {
        "tabs" | "ensure" => {
            let tabs: Vec<Tab> = serde_json::from_value(value).map_err(|_| invalid)?;
            if tabs.len() > 20 || tabs.iter().any(|tab| tab.origin != request.origin || !safe_url(&tab.url, Some(&request.origin)) || !text(&tab.title, 200)) { return Err(invalid.into()); }
            serde_json::to_value(tabs)
        },
        "page" | "observe" => {
            let page: Page = serde_json::from_value(value).map_err(|_| invalid)?;
            if !request.cached_login && matches!(page.login_state, Some(LoginState::Continued | LoginState::Pending | LoginState::SubmitRejected)) { return Err(invalid.into()); }
            if page.observation_id.as_ref().is_some_and(|id|!reference(id))||page.controls.len()>60||page.controls.iter().any(|control|!reference(&control.id)||!text(&control.name,100)||!["invoke","search"].contains(&control.operation.as_str()))||!page.controls.is_empty()&&page.observation_id.is_none(){return Err(invalid.into())}
            if Some(page.tab_id) != request.tab_id || page.origin != request.origin || !safe_url(&page.url, Some(&request.origin)) || !text(&page.title, 200) || !text(&page.text, 12000) || page.links.len() > 40 || page.links.iter().any(|link| !text(&link.text, 100) || !safe_url(&link.url, None)) { return Err(invalid.into()); }
            serde_json::to_value(page)
        },
        "act" => {
            let action:Action=serde_json::from_value(value).map_err(|_|invalid)?;
            if Some(action.tab_id)!=request.tab_id||action.origin!=request.origin||!["dispatched","stale","blocked"].contains(&action.action_status.as_str()){return Err(invalid.into())}
            serde_json::to_value(action)
        },
        "followed_live" => {
            let followed: Followed = serde_json::from_value(value).map_err(|_| invalid)?;
            if !followed.logged_in || followed.rooms.len() > 90 || followed.checked > 90 || followed.rooms.len() as u64 > followed.checked || followed.rooms.iter().any(|room| room.uid == 0 || room.room_id == 0 || room.live_status > 2 || !text(&room.name, 80) || room.name.trim().is_empty() || !text(&room.title, 200)) || (followed.complete && followed.total.is_none_or(|total| total > followed.checked)) { return Err(invalid.into()); }
            serde_json::to_value(followed)
        },
        _ => return Err(invalid.into()),
    }.map_err(|_| invalid)?;
    Ok(serde_json::json!({"data":data,"origin":request.origin,"fetchedAtEpochMs":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis(),"untrusted":true,"privateBrowser":true,"verified":true}))
}
fn reference(id:&str)->bool{id.len()==36&&id.bytes().all(|b|b.is_ascii_hexdigit()||b==b'-')}

#[cfg(test)] mod tests {
    use super::*; use serde_json::json;
    #[test] fn observation_controls_and_action_receipts_fail_closed() {
        let request=Request{kind:"observe".into(),origin:"https://example.com".into(),tab_id:Some(1),cached_login:false,target_url:None,interaction:None};
        let base=json!({"tabId":1,"origin":"https://example.com","url":"https://example.com/notices","title":"门户","text":"通知 2 条","links":[],"truncated":false,"loading":false,"observationId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","controls":[{"id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","name":"通知","operation":"invoke"}]});
        assert!(validate(&request,base.clone()).is_ok());
        let mut bad=base.clone();bad["controls"][0]["operation"]=json!("javascript");assert!(validate(&request,bad).is_err());
        let mut bad=base;bad["controls"][0]["value"]=json!("private-input");assert!(validate(&request,bad).is_err());
        let action=Request{kind:"act".into(),..request};
        assert!(validate(&action,json!({"tabId":1,"origin":"https://example.com","actionStatus":"dispatched"})).is_ok());
        assert!(validate(&action,json!({"tabId":1,"origin":"https://example.com","actionStatus":"completed"})).is_err());
    }
    #[test] fn login_metadata_is_bounded_and_never_accepts_credentials_or_ungrounded_completion() {
        let mut request=Request{kind:"page".into(),origin:"https://example.com".into(),tab_id:Some(1),cached_login:false,target_url:None,interaction:None};
        let base=json!({"tabId":1,"origin":"https://example.com","url":"https://example.com/login","title":"登录","text":"","links":[],"truncated":false,"loading":false});
        for state in ["not_allowed","unfilled","needs_user"] { let mut value=base.clone();value["loginState"]=json!(state);assert!(validate(&request,value).is_ok()); }
        for state in ["continued","pending","submit_rejected","success","password=secret"] {let mut value=base.clone();value["loginState"]=json!(state);assert!(validate(&request,value).is_err());}
        request.cached_login=true;
        let mut rejected=base.clone();rejected["loginState"]=json!("submit_rejected");assert!(validate(&request,rejected).is_ok());
        let mut value=base.clone();value["loginState"]=json!("continued");assert!(validate(&request,value.clone()).is_ok());
        value["password"]=json!("fictional-secret");assert!(validate(&request,value).is_err());
    }
    #[test] fn page_identity_and_fields_fail_closed() {
        let request = Request {kind:"page".into(),origin:"https://example.com".into(),tab_id:Some(1),cached_login:false,target_url:None,interaction:None};
        let base = json!({"tabId":1,"origin":"https://example.com","title":"示例","url":"https://example.com/mail","text":"虚构页面","links":[],"truncated":false,"loading":false});
        assert!(validate(&request, base.clone()).is_ok());
        for (key, value) in [("tabId", json!(2)),("origin",json!("https://evil.com")),("url",json!("https://example.com/?token=secret")),("cookie",json!("secret"))] { let mut bad=base.clone(); bad[key]=value; assert!(validate(&request,bad).is_err()); }
    }
    #[test] fn incomplete_or_unknown_followed_status_is_not_offline() {
        let request=Request {kind:"followed_live".into(),origin:"https://live.bilibili.com".into(),tab_id:None,cached_login:false,target_url:None,interaction:None};
        assert!(validate(&request,json!({"loggedIn":true,"rooms":[],"complete":true,"checked":0,"total":0})).is_ok());
        assert!(validate(&request,json!({"loggedIn":true,"rooms":[],"complete":true,"checked":0,"total":null})).is_err());
        assert!(validate(&request,json!({"loggedIn":false,"rooms":[],"complete":false,"checked":0,"total":null})).is_err());
    }
}
