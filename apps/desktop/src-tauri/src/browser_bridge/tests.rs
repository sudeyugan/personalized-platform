use std::time::{Instant, Duration};
use std::sync::Mutex;
use serde_json::json;
use super::state::{BridgeState, Pair, Job, Request};

pub(super) fn connected() -> BridgeState { BridgeState {enabled:true,sites:vec!["https://example.com".into()],reported_sites:vec!["https://example.com".into()],pair:Some(Pair{token:"test-token".into(),origin:"chrome-extension://abcdefghijklmnopabcdefghijklmnop".into()}),extension_version:Some(super::assets::version().into()),extension_revision:Some(super::assets::revision().into()),extension_path:Some("fixture-extension".into()),..Default::default()} }
#[test] fn query_mode_is_closed_optional_and_does_not_grant_site_or_login_permissions() {
    let mut state=connected();
    let mut request:Request=serde_json::from_value(json!({"kind":"tabs","origin":"https://example.com"})).unwrap();
    assert!(request.query_mode.is_none());
    for mode in ["background","foreground"] {
        request.query_mode=Some(mode.into());assert!(state.check(&request).is_ok());
        state.job=Some(Job{id:"query".into(),request:request.clone(),epoch:state.epoch,expires:Instant::now()+Duration::from_secs(15),sent:false});
        assert_eq!(state.poll(state.sites.clone())["job"]["queryMode"],mode);
    }
    request.query_mode=Some("hidden-script".into());assert!(state.check(&request).is_err());
    assert!(serde_json::from_value::<Request>(json!({"kind":"tabs","origin":"https://example.com","queryMode":true})).is_err());
    request.query_mode=Some("background".into());request.cached_login=true;assert!(state.check(&request).is_err());
    request.cached_login=false;state.reported_sites.clear();assert!(state.check(&request).is_err());
}
#[test] fn exact_page_preparation_is_bounded_and_actions_have_separate_consent() {
    let mut state=connected();
    let mut request=Request{kind:"ensure".into(),origin:state.sites[0].clone(),tab_id:None,cached_login:false,query_mode:None,target_url:Some("https://example.com/notices".into()),interaction:None};
    assert!(state.check(&request).is_ok());
    for url in ["https://other.example.com/","https://example.com/?token=secret","https://example.com/#secret","http://example.com/"]{request.target_url=Some(url.into());assert!(state.check(&request).is_err());}
    request.kind="act".into();request.target_url=None;request.tab_id=Some(7);
    request.interaction=Some(super::state::Interaction{observation_id:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".into(),element_id:"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb".into(),operation:"invoke".into(),query:None});
    assert!(state.check(&request).is_err());state.interaction_sites=state.sites.clone();assert!(state.check(&request).is_ok());
    request.interaction.as_mut().unwrap().operation="javascript".into();assert!(state.check(&request).is_err());
    request.interaction.as_mut().unwrap().operation="search".into();assert!(state.check(&request).is_err());
    request.interaction.as_mut().unwrap().query=Some("申请截止".into());assert!(state.check(&request).is_ok());
    state.reported_sites.clear();assert!(state.check(&request).is_err());
}
#[test] fn cached_login_requires_separate_consent_and_current_single_delivery() {
    let mut state=connected();
    let request=Request {kind:"page".into(),origin:state.sites[0].clone(),tab_id:Some(7),cached_login:true,query_mode:None,target_url:None,interaction:None};
    assert!(state.check(&request).is_err());
    state.cached_login_sites=state.sites.clone(); assert!(state.check(&request).is_ok());
    state.job=Some(Job{id:"login-job".into(),request,epoch:state.epoch,expires:Instant::now()+Duration::from_secs(15),sent:false});
    assert!(!state.active_login("login-job"));
    assert_eq!(state.poll(state.sites.clone())["job"]["cachedLogin"],true);
    assert!(state.active_login("login-job")); assert!(!state.active_login("another-job"));
    state.cached_login_sites.clear();assert!(!state.active_login("login-job"));
    state.cached_login_sites=state.sites.clone();state.cancel();assert!(!state.active_login("login-job"));
}
#[test] fn old_read_request_has_no_login_consent_and_flags_cannot_expand_other_tools() {
    let request:Request=serde_json::from_value(json!({"kind":"page","origin":"https://example.com","tabId":7})).unwrap();
    assert!(!request.cached_login);
    let mut state=connected();state.cached_login_sites=state.sites.clone();
    assert!(state.check(&Request{kind:"tabs".into(),origin:state.sites[0].clone(),tab_id:None,cached_login:true,query_mode:None,target_url:None,interaction:None}).is_err());
    state.job=Some(Job{id:"expired".into(),request:Request{cached_login:true,..request},epoch:state.epoch,expires:Instant::now()-Duration::from_secs(1),sent:true});
    assert!(!state.active_login("expired"));
}
#[test] fn permission_requires_both_sides_and_matching_pair() {
    let mut state = connected(); let request = Request{kind:"page".into(),origin:"https://example.com".into(),tab_id:Some(1),cached_login:false,query_mode:None,target_url:None,interaction:None};
    assert!(state.check(&request).is_ok());
    assert!(state.authenticate("chrome-extension://abcdefghijklmnopabcdefghijklmnop", "test-token").is_ok());
    assert!(state.authenticate("chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba", "test-token").is_err());
    assert!(state.authenticate("chrome-extension://abcdefghijklmnopabcdefghijklmnop", "bad").is_err());
    state.reported_sites.clear(); assert!(state.check(&request).is_err());
    state.reported_sites=state.sites.clone(); state.enabled=false; assert!(state.check(&request).is_err());
}
#[test] fn requests_are_delivered_once_and_revocation_invalidates_epoch() {
    let mut state=connected(); state.job=Some(Job{id:"nonce".into(),request:Request{kind:"page".into(),origin:"https://example.com".into(),tab_id:Some(7),cached_login:false,query_mode:None,target_url:None,interaction:None},epoch:0,expires:Instant::now()+Duration::from_secs(10),sent:false});
    assert_eq!(state.poll(vec!["https://example.com".into()])["job"]["id"],"nonce");
    assert_eq!(state.poll(vec!["https://example.com".into()])["job"],json!(null));
    state.poll(vec![]); assert!(state.job.is_none()); assert_eq!(state.epoch,1);
}
#[test] fn no_arbitrary_scripts_or_api_requests() {
    let state=connected(); for kind in ["fetch","script","click","fill","navigate"] { assert!(state.check(&Request{kind:kind.into(),origin:"https://example.com".into(),tab_id:None,cached_login:false,query_mode:None,target_url:None,interaction:None}).is_err()); }
    assert!(state.check(&Request{kind:"followed_live".into(),origin:"https://example.com".into(),tab_id:None,cached_login:false,query_mode:None,target_url:None,interaction:None}).is_err());
}
#[test] fn metadata_never_contains_token_or_pending_code() {
    let mut state=connected(); state.pending_pair=Some(("another-secret".into(),Instant::now())); let status=state.status().to_string(); assert!(!status.contains("test-token")); assert!(!status.contains("another-secret"));
}
#[test] fn cancellation_before_worker_start_cannot_create_a_job() {
    let state=Mutex::new(connected());
    state.lock().unwrap().cancel();
    let request=Request{kind:"tabs".into(),origin:"https://example.com".into(),tab_id:None,cached_login:false,query_mode:None,target_url:None,interaction:None};
    assert!(super::execute(&state,request,0).unwrap_err().contains("BROWSER_CANCELLED"));
    assert!(state.lock().unwrap().job.is_none());
}
#[test] fn pair_code_expires_and_cannot_replace_an_existing_pair() {
    let mut state=connected();state.pair=None;state.pending_pair=Some(("test-code".into(),Instant::now()));
    assert!(state.check_pair("test-code").is_ok());assert!(state.check_pair("wrong").is_err());
    state.pending_pair=Some(("test-code".into(),Instant::now()-Duration::from_secs(601)));
    assert!(state.check_pair("test-code").is_err());state.pending_pair=Some(("test-code".into(),Instant::now()));
    state.pair=connected().pair;assert!(state.check_pair("test-code").is_err());
}
