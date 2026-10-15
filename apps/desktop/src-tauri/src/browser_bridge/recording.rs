use std::time::{Duration,Instant};
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use super::{policy,state::BridgeState};

#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="snake_case")]
pub enum Cue { Inbox,Unread,All,Notifications,Updates,Following,Next,Previous,Refresh,Search,ManualAuth,Navigation,UnknownButton,UnknownTab }
#[derive(Clone,Copy,PartialEq,Serialize)]
#[serde(rename_all="snake_case")]
pub enum Phase { Recording,Paused,Review }
pub struct Recording { pub id:String,pub origin:String,pub tab_id:u64,pub epoch:u64,pub expires:Instant,pub phase:Phase,pub events:Vec<Cue> }
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Message { pub recording_id:String,pub action:String,pub cue:Option<Cue> }
impl BridgeState {
    pub fn recording_status(&mut self)->Value{
        let offline=self.last_seen.is_none_or(|time|time.elapsed()>=Duration::from_secs(12));
        if let Some(record)=self.recording.as_mut(){if record.expires<=Instant::now()||offline{record.phase=Phase::Review}}
        self.recording.as_ref().map_or(Value::Null,|r|json!({"id":r.id,"origin":r.origin,"tabId":r.tab_id,"phase":r.phase,"events":r.events,"remainingSeconds":r.expires.saturating_duration_since(Instant::now()).as_secs()}))
    }
    pub fn recording_lease(&mut self)->Value{
        self.recording_status();
        self.recording.as_ref().filter(|r|r.phase!=Phase::Review).map_or(Value::Null,|r|json!({"id":r.id,"origin":r.origin,"tabId":r.tab_id,"phase":r.phase,"ttlMs":4500}))
    }
    pub fn begin_recording(&mut self,id:String,origin:String,tab_id:u64)->Result<Value,String>{
        let origin=policy::origin(&origin)?;
        if !self.authorised(&origin)||!self.compatible()||self.last_seen.is_none_or(|t|t.elapsed()>=Duration::from_secs(12)){return Err("BROWSER_SITE_PERMISSION:请先连接并在两侧授权这个网站".into())}
        if self.recording.is_some()||self.job.is_some(){return Err("BROWSER_BUSY:请先停止当前任务或完成前一次示范整理".into())}
        self.cancel();
        self.recording=Some(Recording{id,origin,tab_id,epoch:self.epoch,expires:Instant::now()+Duration::from_secs(300),phase:Phase::Recording,events:vec![]});
        Ok(self.recording_status())
    }
    pub fn record_message(&mut self,message:Message)->Result<Value,String>{
        self.recording_status();
        let r=self.recording.as_ref().filter(|r|r.id==message.recording_id&&r.epoch==self.epoch&&self.authorised(&r.origin)&&self.compatible()).ok_or("BROWSER_STALE:示范已停止、撤销或更换")?;
        if message.action!="event"&&message.cue.is_some(){return Err("BROWSER_ARGUMENT:控制操作不能携带记录内容".into())}
        let expired=r.expires<=Instant::now();
        let r=self.recording.as_mut().unwrap();
        match message.action.as_str(){
            "event" if !expired&&r.phase==Phase::Recording=>{
                let cue=message.cue.ok_or("BROWSER_ARGUMENT:缺少安全操作类型")?;
                r.events.push(cue);
                if r.events.len()>=7{r.phase=Phase::Review;}
            },
            "pause" if !expired&&r.phase==Phase::Recording=>r.phase=Phase::Paused,
            "resume" if !expired&&r.phase==Phase::Paused&&r.events.len()<7=>r.phase=Phase::Recording,
            "stop"=>r.phase=Phase::Review,
            "cancel"=>{self.recording=None;return Ok(Value::Null)},
            _=>return Err("BROWSER_STALE:示范状态不支持这次操作，未接受额外内容".into()),
        }
        Ok(self.recording_status())
    }
}

#[cfg(test)]mod tests{
    use super::*;use crate::browser_bridge::{assets,state::Pair};
    fn ready()->BridgeState{let mut s=BridgeState::default();s.enabled=true;s.pair=Some(Pair{token:"a".repeat(64),origin:"chrome-extension://abcdefghijklmnopabcdefghijklmnop".into()});s.sites=vec!["https://example.com".into()];s.reported_sites=s.sites.clone();s.extension_path=Some("fixture".into());s.extension_version=Some(assets::version().into());s.extension_revision=Some(assets::revision().into());s.last_seen=Some(Instant::now());s}
    fn message(action:&str,cue:Option<Cue>)->Message{Message{recording_id:"b".repeat(64),action:action.into(),cue}}
    #[test]fn capture_requires_current_scope_and_cancel_clears_ram(){let mut s=ready();assert!(s.begin_recording("b".repeat(64),"https://other.example.com".into(),1).is_err());s.begin_recording("b".repeat(64),s.sites[0].clone(),1).unwrap();s.record_message(message("event",Some(Cue::Unread))).unwrap();s.cancel();assert!(s.recording.is_none());assert!(s.record_message(message("event",Some(Cue::Inbox))).is_err());}
    #[test]fn events_are_closed_schema_and_never_accept_content(){for bad in [json!({"recordingId":"b","action":"event","cue":"unknown","text":"private"}),json!({"recordingId":"b","action":"event","cue":"inbox","value":"secret"}),json!({"recordingId":"b","action":"event","cue":"password"})]{assert!(serde_json::from_value::<Message>(bad).is_err());}}
    #[test]fn repeated_navigation_remains_two_steps(){let mut s=ready();s.begin_recording("b".repeat(64),s.sites[0].clone(),1).unwrap();for _ in 0..2{s.record_message(message("event",Some(Cue::Next))).unwrap();}assert_eq!(s.recording_status()["events"],json!(["next","next"]));}
    #[test]fn pause_expiry_and_cap_do_not_continue_capture(){let mut s=ready();s.begin_recording("b".repeat(64),s.sites[0].clone(),1).unwrap();s.record_message(message("pause",None)).unwrap();assert!(s.record_message(message("event",Some(Cue::Unread))).is_err());s.record_message(message("resume",None)).unwrap();for cue in [Cue::Inbox,Cue::Unread,Cue::All,Cue::Notifications,Cue::Updates,Cue::Following,Cue::Next]{s.record_message(message("event",Some(cue))).unwrap();}assert!(s.record_message(message("event",Some(Cue::Search))).is_err());assert_eq!(s.recording_status()["phase"],"review");assert_eq!(s.recording_status()["events"].as_array().unwrap().len(),7);assert!(s.recording_lease().is_null());}
    #[test]fn revoked_site_and_expired_session_refuse_events(){let mut s=ready();s.begin_recording("b".repeat(64),s.sites[0].clone(),1).unwrap();s.recording.as_mut().unwrap().expires=Instant::now()-Duration::from_secs(1);assert!(s.record_message(message("event",Some(Cue::Unread))).is_err());assert_eq!(s.recording_status()["phase"],"review");s.reported_sites.clear();assert!(s.record_message(message("stop",None)).is_err());}
}
