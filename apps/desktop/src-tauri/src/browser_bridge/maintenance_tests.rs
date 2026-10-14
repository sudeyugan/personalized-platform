use serde_json::json;
use std::time::{Duration,Instant};
use super::{assets,state::{Request,Job},maintenance::SetupReply,tests::connected};
fn reply(id:&str, action:&str, sites:Option<Vec<String>>)->SetupReply{SetupReply{id:id.into(),action:action.into(),sites}}
#[test] fn canonical_manifest_is_the_version_source_and_old_clients_cannot_read(){
    let mut state=connected();assert_eq!(assets::version(),"0.4.1");
    state.report_version(Some("0.3.0".into())).unwrap();assert!(!state.compatible());
    state.report_version(Some("0.2.0".into())).unwrap();assert!(!state.compatible());
    state.report_version(None).unwrap();assert!(!state.compatible());assert!(state.check(&Request{kind:"tabs".into(),origin:state.sites[0].clone(),tab_id:None,cached_login:false,target_url:None,interaction:None}).unwrap_err().contains("UPDATE_REQUIRED"));
    let body=state.poll(state.sites.clone());assert_eq!(body["job"],json!(null));assert_eq!(body["maintenance"]["version"],assets::version());assert_eq!(body["maintenance"]["ready"],true);
    for invalid in ["javascript:evil","", "1..2"]{assert!(state.report_version(Some(invalid.into())).is_err());}
    state.report_version(Some(assets::version().into())).unwrap();assert!(state.compatible());
    state.extension_path=None;assert!(!state.compatible());
}
#[test] fn explicit_setting_is_delivered_once_and_only_current_confirmation_can_open(){
    let mut state=connected();state.request_setup("fixture".into(),state.sites.clone(),Some(state.sites[0].clone())).unwrap();
    assert!(state.request_setup("duplicate".into(),state.sites.clone(),None).is_err());
    assert!(state.setup_reply(reply("fixture","inspect",None)).is_err()); // not delivered
    assert_eq!(state.poll(state.sites.clone())["maintenance"]["setup"]["id"],"fixture");
    assert_eq!(state.poll(state.sites.clone())["maintenance"]["setup"],json!(null));
    assert_eq!(state.setup_reply(reply("fixture","inspect",None)).unwrap()["sites"],json!(state.sites));
    assert!(state.setup_reply(reply("other","complete",Some(state.sites.clone()))).is_err());
    assert!(state.setup_reply(reply("fixture","complete",Some(vec![]))).is_err());
    assert!(state.setup_reply(reply("fixture","fetch",None)).is_err());
    let completed=state.setup_reply(reply("fixture","complete",Some(state.sites.clone()))).unwrap();assert_eq!(completed["openOrigin"],state.sites[0]);
    assert!(state.setup_reply(reply("fixture","complete",Some(state.sites.clone()))).is_err());
}
#[test] fn setup_cannot_expand_sites_or_smuggle_a_url(){
    let mut state=connected();for targets in [vec![],vec!["https://other.example.com".into()],vec!["https://*.example.com".into()]]{assert!(state.request_setup("id".into(),targets,None).is_err());}
    for target in ["https://other.example.com","https://example.com/path","https://example.com?token=secret","http://example.com","https://user:password@example.com"]{assert!(state.request_setup("id".into(),state.sites.clone(),Some(target.into())).is_err());}
    state.enabled=false;assert!(state.request_setup("id".into(),state.sites.clone(),None).is_err());state.enabled=true;state.pair=None;assert!(state.request_setup("id".into(),state.sites.clone(),None).is_err());
}
#[test] fn cancel_expiry_revoke_disconnect_and_version_changes_fail_closed(){
    for cause in ["cancel","expiry","revoke","disconnect","version","disable"]{
        let mut state=connected();state.request_setup("id".into(),state.sites.clone(),None).unwrap();state.poll(state.sites.clone());
        match cause{"cancel"=>state.cancel(),"expiry"=>state.setup.as_mut().unwrap().expires=Instant::now()-Duration::from_secs(1),"revoke"=>state.sites.clear(),"disconnect"=>state.pair=None,"version"=>state.report_version(None).unwrap(),_=>state.enabled=false}
        assert!(state.setup_reply(reply("id","complete",Some(vec!["https://example.com".into()]))).is_err(),"{cause}");
    }
}
#[test] fn version_change_cancels_inflight_reads_and_maintenance_exposes_no_secrets(){
    let mut state=connected();state.job=Some(Job{id:"job".into(),request:Request{kind:"tabs".into(),origin:state.sites[0].clone(),tab_id:None,cached_login:false,target_url:None,interaction:None},epoch:state.epoch,expires:Instant::now()+Duration::from_secs(40),sent:true});
    let epoch=state.epoch;state.report_version(None).unwrap();assert!(state.job.is_none());assert!(state.epoch>epoch);
    let public=state.maintenance().to_string();assert!(!public.contains("test-token"));assert!(!public.contains("fixture-extension"));
}
#[test] fn unchanged_protocol_with_changed_packaged_content_also_requires_reload(){
    let mut state=connected();let epoch=state.epoch;
    state.report_revision(Some("0".repeat(64))).unwrap();assert!(state.epoch>epoch);assert!(!state.compatible());
    assert!(state.request_setup("id".into(),state.sites.clone(),None).unwrap_err().contains("UPDATE_REQUIRED"));
    state.report_revision(Some(assets::revision().into())).unwrap();assert!(state.compatible());
    assert!(state.report_revision(Some("not-a-revision".into())).is_err());
}
