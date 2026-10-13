mod policy;
mod target;
mod uia;
#[cfg(test)] mod tests;
#[cfg(test)] mod probe;

use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::HashMap, sync::atomic::Ordering, time::{Duration, Instant}};
use super::{types::{ComputerActionRequest, ComputerPolicy, ComputerRuntime}, policy::authorize};

#[derive(Debug, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum Request {
    Begin { window_id: String, mode: String },
    Observe { session_id: String },
    Act { session_id: String, revision: u32, element_id: String, operation: String, #[serde(default)] text: String },
    End { session_id: String },
}

pub struct Session {
    pub id: String, pub window_id: String, pub mode: String, pub expires: Instant,
    pub generation: u64, revision: u32, actions: u32, controls: Vec<uia::Control>,
    policy: ComputerPolicy, owner_created: u64,
}

fn check_policy(policy: &ComputerPolicy, title: &str, write: bool, confirmed: bool) -> Result<(), String> {
    let req = |action: &str, key: &str, value: String| ComputerActionRequest { action: action.into(), params: HashMap::from([(key.into(), json!(value))]) };
    authorize(policy, &req("window_focus", "title", title.into()), confirmed)?;
    authorize(policy, &req("screen_capture", "source", format!("window:{title}")), confirmed)?;
    if write { authorize(policy, &req("input_click", "title", title.into()), confirmed)?; }
    Ok(())
}

pub fn execute(runtime: &ComputerRuntime, policy: &ComputerPolicy, request: Request, confirmed: bool) -> Result<Value, String> {
    if let Request::End { ref session_id } = request {
        let mut slot = runtime.takeover.lock().map_err(|_| "TAKEOVER_BUSY")?;
        if slot.as_ref().is_some_and(|session| session.id == *session_id) {
            runtime.takeover_generation.fetch_add(1, Ordering::SeqCst); *slot = None;
        }
        return Ok(json!({ "ended": true }));
    }
    if !policy.enabled { return Err("COMPUTER_PERMISSION_DISABLED".into()); }
    let _desktop = runtime.desktop_operation.lock().map_err(|_| "TAKEOVER_BUSY")?;
    let mut slot = runtime.takeover.lock().map_err(|_| "TAKEOVER_BUSY")?;
    if let Request::Begin { window_id, mode } = request {
        if !confirmed { return Err("TAKEOVER_START_CONFIRMATION_REQUIRED".into()); }
        if !matches!(mode.as_str(), "read" | "control") { return Err("TAKEOVER_MODE_INVALID".into()); }
        if slot.as_ref().is_some_and(|session| session.expires > Instant::now()) { return Err("TAKEOVER_BUSY:已有接管任务，请先停止".into()); }
        let (_, info, owner_created) = target::resolve(&window_id)?;
        check_policy(policy, &info.title, mode == "control", true)?;
        let id = format!("{:?}", windows::core::GUID::new().map_err(|_| "TAKEOVER_ID_FAILED")?);
        let generation = runtime.takeover_generation.fetch_add(1, Ordering::SeqCst) + 1;
        *slot = Some(Session { id: id.clone(), window_id, mode, expires: Instant::now() + Duration::from_secs(180), generation, revision: 0, actions: 0, controls: Vec::new(), policy: policy.clone(), owner_created });
        return Ok(json!({ "sessionId": id, "windowTitle": info.title, "maxActions": 8, "expiresInSeconds": 180 }));
    }
    let session_id = match &request { Request::Observe { session_id } | Request::Act { session_id, .. } => session_id, _ => unreachable!() };
    let session = slot.as_mut().filter(|session| session.id == *session_id).ok_or("TAKEOVER_SESSION_INVALID")?;
    if session.expires <= Instant::now() || session.generation != runtime.takeover_generation.load(Ordering::SeqCst) { return Err("TAKEOVER_SESSION_EXPIRED:请重新确认接管".into()); }
    if session.policy != *policy { return Err("TAKEOVER_POLICY_CHANGED:权限变更后必须重新确认".into()); }
    if let Request::Act { revision, operation, text, .. } = &request {
        if session.mode != "control" { return Err("TAKEOVER_READ_ONLY_SESSION".into()); }
        if session.actions >= 8 { return Err("TAKEOVER_ACTION_LIMIT".into()); }
        if *revision != session.revision { return Err("TAKEOVER_STALE_OBSERVATION".into()); }
        if !matches!(operation.as_str(), "fill" | "invoke") { return Err("TAKEOVER_OPERATION_INVALID".into()); }
        policy::validate_text(text)?;
    }
    let (hwnd, info, owner_created) = target::resolve(&session.window_id)?;
    if owner_created != session.owner_created { return Err("TAKEOVER_TARGET_LOST".into()); }
    check_policy(policy, &info.title, matches!(request, Request::Act { .. }), true)?;
    let automation = uia::Automation::new()?;
    let snapshot = uia::walk(&automation, hwnd)?;
    let current = snapshot.controls;
    if session.expires <= Instant::now() || session.generation != runtime.takeover_generation.load(Ordering::SeqCst) { return Err("TAKEOVER_STOPPED".into()); }
    match request {
        Request::Observe { .. } => {
            session.revision += 1; session.controls = current.into_iter().map(|(control, _)| control).collect();
            Ok(json!({ "revision": session.revision, "windowTitle": info.title, "controls": session.controls, "truncated": snapshot.truncated }))
        }
        Request::Act { revision, element_id, operation, text, .. } => {
            if session.mode != "control" { return Err("TAKEOVER_READ_ONLY_SESSION".into()); }
            if session.actions >= 8 { return Err("TAKEOVER_ACTION_LIMIT".into()); }
            if revision != session.revision { return Err("TAKEOVER_STALE_OBSERVATION".into()); }
            let expected = session.controls.iter().find(|control| control.id == element_id).ok_or("TAKEOVER_ELEMENT_NOT_OBSERVED")?;
            let (actual, element) = current.iter().find(|(control, _)| control.runtime_id == expected.runtime_id).ok_or("TAKEOVER_ELEMENT_CHANGED")?;
            if actual.name != expected.name || actual.control_type != expected.control_type || actual.automation_id != expected.automation_id { return Err("TAKEOVER_ELEMENT_CHANGED".into()) }
            if policy::forbidden(&actual.name) || policy::forbidden(&actual.automation_id) { return Err("TAKEOVER_CONSEQUENTIAL_ACTION_DENIED:此控件可能涉及提交、删除或敏感操作，请手动处理".into()); }
            if operation == "fill" && (!actual.can_fill || actual.control_type != 50004) { return Err("TAKEOVER_FILL_UNSUPPORTED".into()); }
            if operation == "invoke" && !actual.can_invoke { return Err("TAKEOVER_INVOKE_UNSUPPORTED".into()); }
            if operation == "invoke" && !policy::auto_invoke(&actual.name) && !confirmed { return Err("TAKEOVER_ACTION_CONFIRMATION_REQUIRED:请确认这个按钮的实际作用".into()); }
            if operation == "fill" && !policy::auto_fill(&actual.name, &actual.automation_id) && !confirmed { return Err("TAKEOVER_ACTION_CONFIRMATION_REQUIRED:普通输入框的用途需你确认".into()); }
            policy::validate_text(&text)?;
            // Consume before dispatch: a timeout or partial effect must never replay this observation.
            session.actions += 1; session.controls.clear(); session.revision += 1;
            if session.expires <= Instant::now() || session.generation != runtime.takeover_generation.load(Ordering::SeqCst) { return Err("TAKEOVER_STOPPED".into()); }
            let verified = uia::act(element, &operation, &text)?;
            Ok(json!({ "dispatched": true, "verified": verified, "needsObservation": true, "actionsUsed": session.actions }))
        }
        _ => unreachable!(),
    }
}
