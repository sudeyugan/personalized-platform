use super::{assets,worker::Worker};
use serde_json::json;
use std::sync::atomic::{AtomicU64,Ordering};
#[test]
#[ignore="explicit Windows test; requires prepared bundled runtime and installed Edge"]
fn packaged_worker_uses_owned_job_and_rejects_cancelled_commands(){
    let root=tempfile::tempdir().unwrap();let epoch=AtomicU64::new(0);
    let directory=assets::prepare(root.path()).unwrap();
    let mut worker=Worker::start(&directory,&root.path().join("profile")).unwrap();
    worker.call(json!({"kind":"configure","sites":["https://www.example.com"],"interactions":[]}),&epoch,0).unwrap();
    let tabs=worker.call(json!({"kind":"request","request":{"kind":"tabs","origin":"https://www.example.com"}}),&epoch,0).unwrap();
    assert!(tabs.is_array());epoch.fetch_add(1,Ordering::SeqCst);
    assert_eq!(worker.call(json!({"kind":"login","origin":"https://www.example.com","url":"https://www.example.com"}),&epoch,0),Err("BROWSER_CANCELLED:".into()));
    drop(worker);root.close().unwrap();
}
