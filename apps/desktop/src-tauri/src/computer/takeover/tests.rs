use super::*;
fn policy() -> ComputerPolicy { ComputerPolicy { enabled: true, profile: "ask".into(), ffmpeg_path: String::new(), recording_directory: String::new(), grants: Vec::new() } }
fn fixture(mode: &str) -> ComputerRuntime {
    let runtime = ComputerRuntime::default();
    *runtime.takeover.lock().unwrap() = Some(Session { id: "s1".into(), window_id: "fake".into(), mode: mode.into(), expires: Instant::now() + Duration::from_secs(180), generation: 0, revision: 1, actions: 0, controls: Vec::new(), policy: policy(), owner_created: 1 });
    runtime
}
fn act(revision: u32) -> Request { Request::Act { session_id: "s1".into(), revision, element_id: "e1".into(), operation: "fill".into(), text: "报告".into() } }
#[test] fn request_rejects_extra_fields_and_arbitrary_operations_shape() {
    assert!(serde_json::from_value::<Request>(json!({ "action": "begin", "windowId": "w", "mode": "read", "shell": "bad" })).is_err());
    assert!(serde_json::from_value::<Request>(json!({ "action": "act", "sessionId": "s", "elementId": "e", "revision": -1, "operation": "fill" })).is_err());
    assert!(serde_json::from_value::<Request>(json!({ "action": "observe", "sessionId": "s" })).is_ok());
}
#[test] fn begin_needs_user_start_and_valid_mode_before_window_lookup() {
    let runtime = ComputerRuntime::default();
    assert!(execute(&runtime, &policy(), Request::Begin { window_id: "fake".into(), mode: "control".into() }, false).unwrap_err().contains("CONFIRMATION_REQUIRED"));
    assert!(execute(&runtime, &policy(), Request::Begin { window_id: "fake".into(), mode: "shell".into() }, true).unwrap_err().contains("MODE_INVALID"));
}
#[test] fn readonly_old_observation_and_step_limit_fail_before_uia() {
    assert!(execute(&fixture("read"), &policy(), act(1), true).unwrap_err().contains("READ_ONLY_SESSION"));
    let runtime = fixture("control");
    assert!(execute(&runtime, &policy(), act(0), true).unwrap_err().contains("STALE_OBSERVATION"));
    runtime.takeover.lock().unwrap().as_mut().unwrap().actions = 8;
    assert!(execute(&runtime, &policy(), act(1), true).unwrap_err().contains("ACTION_LIMIT"));
}
#[test] fn live_policy_changes_and_disabled_permissions_cannot_reuse_lease() {
    let runtime = fixture("control"); let mut changed = policy(); changed.profile = "trusted".into();
    assert!(execute(&runtime, &changed, act(1), true).unwrap_err().contains("POLICY_CHANGED"));
    changed.enabled = false;
    assert!(execute(&runtime, &changed, act(1), true).unwrap_err().contains("PERMISSION_DISABLED"));
    execute(&runtime, &changed, Request::End { session_id: "s1".into() }, false).unwrap();
    assert!(runtime.takeover.lock().unwrap().is_none());
}
#[test] fn expiry_and_emergency_epoch_are_enforced() {
    let runtime = fixture("control");
    runtime.takeover_generation.fetch_add(1, Ordering::SeqCst);
    assert!(execute(&runtime, &policy(), act(1), true).unwrap_err().contains("SESSION_EXPIRED"));
    let runtime = fixture("control");
    runtime.takeover.lock().unwrap().as_mut().unwrap().expires = Instant::now() - Duration::from_secs(1);
    assert!(execute(&runtime, &policy(), act(1), true).unwrap_err().contains("SESSION_EXPIRED"));
    assert_eq!(runtime.stop_all(), 1); assert!(runtime.takeover.lock().unwrap().is_none());
}
#[test] fn unrelated_end_cannot_cancel_another_session() {
    let runtime = fixture("control");
    execute(&runtime, &policy(), Request::End { session_id: "different".into() }, false).unwrap();
    assert!(runtime.takeover.lock().unwrap().is_some()); assert_eq!(runtime.takeover_generation.load(Ordering::SeqCst), 0);
    execute(&runtime, &policy(), Request::End { session_id: "s1".into() }, false).unwrap();
    assert!(execute(&runtime, &policy(), act(1), true).unwrap_err().contains("SESSION_INVALID"));
}
