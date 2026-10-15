use std::{io::{Read, Write},net::{TcpListener,TcpStream},time::{Duration,Instant}};
use serde_json::json;
use super::{http,policy,server,state::{BridgeState,Job,Request},tests::connected};

#[test]
fn current_task_check_round_trips_through_real_http_and_authenticated_dispatch() {
    let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();let address=listener.local_addr().unwrap();
    let worker=std::thread::spawn(move||{
        let mut state=connected();let request=Request{kind:"ensure".into(),origin:state.sites[0].clone(),tab_id:None,cached_login:false,query_mode:None,target_url:None,interaction:None};
        state.job=Some(Job{id:"fixture-job".into(),request,epoch:state.epoch,expires:Instant::now()+Duration::from_secs(10),sent:true});
        for index in 0..4{
            let(mut socket,_)=listener.accept().unwrap();let request=http::receive(&mut socket).unwrap();let origin=request.origin.clone();
            if index==2{state.cancel();}
            let reply=server::authenticated_request(&mut state,request);http::respond(&mut socket,Some(&origin),reply);
        }
    });
    let send=|token:&str|{
        let mut socket=TcpStream::connect(address).unwrap();socket.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
        let body=json!({"id":"fixture-job"}).to_string();
        write!(socket,"POST /active HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nX-Yiyu-Extension: chrome-extension://abcdefghijklmnopabcdefghijklmnop\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",policy::PORT,token,body.len(),body).unwrap();
        let mut response=String::new();socket.read_to_string(&mut response).unwrap();response
    };
    assert!(send("test-token").contains("\"active\":true"));
    assert!(send("wrong-token").starts_with("HTTP/1.1 403"));
    assert!(send("test-token").contains("\"active\":false"));
    assert!(send("test-token").contains("\"active\":false"));worker.join().unwrap();
}

#[test]
fn recording_round_trips_authenticated_http_and_refuses_content_or_revoked_capture() {
    let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();let address=listener.local_addr().unwrap();
    let worker=std::thread::spawn(move||{
        let mut state=connected();state.last_seen=Some(Instant::now());state.begin_recording("b".repeat(64),state.sites[0].clone(),7).unwrap();
        for index in 0..5{
            let(mut socket,_)=listener.accept().unwrap();let request=http::receive(&mut socket).unwrap();let origin=request.origin.clone();
            if index==4{state.cancel();}
            let reply=server::authenticated_request(&mut state,request);http::respond(&mut socket,Some(&origin),reply);
        }
    });
    let send=|token:&str,body:serde_json::Value|{
        let mut socket=TcpStream::connect(address).unwrap();socket.set_read_timeout(Some(Duration::from_secs(3))).unwrap();let body=body.to_string();
        write!(socket,"POST /record HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nX-Yiyu-Extension: chrome-extension://abcdefghijklmnopabcdefghijklmnop\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",policy::PORT,token,body.len(),body).unwrap();
        let mut response=String::new();socket.read_to_string(&mut response).unwrap();response
    };
    let event=json!({"recordingId":"b".repeat(64),"action":"event","cue":"unread"});
    assert!(send("test-token",event.clone()).contains("\"events\":[\"unread\"]"));
    assert!(send("wrong-token",event.clone()).starts_with("HTTP/1.1 403"));
    assert!(send("test-token",json!({"recordingId":"b".repeat(64),"action":"event","cue":"inbox","text":"fixture-private"})).starts_with("HTTP/1.1 403"));
    assert!(send("test-token",json!({"recordingId":"b".repeat(64),"action":"pause"})).contains("\"phase\":\"paused\""));
    assert!(send("test-token",event).starts_with("HTTP/1.1 403"));worker.join().unwrap();
}

/// Explicit integration host: fresh Edge + fictional inbox only, no Tauri app
/// or user's pairing store. Parsing/authenticated dispatch/result validation
/// are production code; the fixture's first pair is kept in memory only.
#[test]
#[ignore]
fn isolated_edge_native_transport_fixture() {
    const FIXTURE_PORT:u16=38478;
    let listener=TcpListener::bind(("127.0.0.1",FIXTURE_PORT)).expect("fixture port occupied; never connect to existing app");listener.set_nonblocking(true).unwrap();
    let site="https://mailbox.example.com".to_string();let code="f".repeat(64);
    let mut state=BridgeState{enabled:true,sites:vec![site.clone()],reported_sites:vec![site.clone()],pending_pair:Some((code,Instant::now())),extension_version:Some(super::assets::version().into()),extension_revision:Some(super::assets::revision().into()),extension_path:Some("fictional-fixture".into()),..Default::default()};
    println!("NATIVE_FIXTURE_READY {} {}",super::assets::version(),super::assets::revision());
    let started=Instant::now();let mut phase=0;let mut active_calls=0;
    while started.elapsed()<Duration::from_secs(90){
        if state.pair.is_some()&&state.job.is_none()&&phase==0{
            state.job=Some(Job{id:"fixture-ensure".into(),request:Request{kind:"ensure".into(),origin:site.clone(),tab_id:None,cached_login:false,query_mode:None,target_url:Some(format!("{site}/inbox")),interaction:None},epoch:state.epoch,expires:Instant::now()+Duration::from_secs(45),sent:false});phase=1;
        }
        let(mut socket,_)=match listener.accept(){Ok(value)=>value,Err(error)if error.kind()==std::io::ErrorKind::WouldBlock=>{std::thread::sleep(Duration::from_millis(20));continue},Err(error)=>panic!("fixture listener failed: {}",error.kind())};
        let reply=match http::receive_fixture(&mut socket,FIXTURE_PORT){
            Ok(request)=>{let origin=request.origin.clone();let result=if request.method=="OPTIONS"{Ok(json!({"ok":true}))}else if request.path=="/pair"{
                let token=request.body["code"].as_str().unwrap();state.check_pair(token).unwrap();state.pair=Some(super::state::Pair{token:token.into(),origin:request.origin});state.pending_pair=None;state.cancel();Ok(json!({"paired":true}))
            }else{if request.path=="/active"{active_calls+=1;}server::authenticated_request(&mut state,request)};http::respond(&mut socket,Some(&origin),result);true},
            Err(error)=>{http::respond(&mut socket,None,Err(error));false}
        };
        if !reply{continue}
        if let Some(result)=state.reply.take(){
            let value=result.expect("production bridge rejected fixture result");state.job=None;
            if phase==1{let id=value["data"][0]["tabId"].as_u64().unwrap();state.job=Some(Job{id:"fixture-page".into(),request:Request{kind:"page".into(),origin:site.clone(),tab_id:Some(id),cached_login:false,query_mode:None,target_url:None,interaction:None},epoch:state.epoch,expires:Instant::now()+Duration::from_secs(45),sent:false});phase=2;}
            else{assert!(value["data"]["text"].as_str().unwrap().contains("未读邮件 2"));assert!(active_calls>=2);println!("NATIVE_FIXTURE_PASS prepare_then_read active_calls={active_calls}");return}
        }
    }
    panic!("native extension fixture timed out at phase {phase}");
}
