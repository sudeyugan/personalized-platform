use serde::{Deserialize, Serialize};
use std::sync::{atomic::{AtomicU64, Ordering}, Mutex};
use tauri::{ipc::Channel, AppHandle, Emitter, Manager, State, WebviewWindow};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FeedbackStatus { Queued, Preparing, Running, Paused, Completed, Failed, Cancelled }

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskFeedback {
    task_id: String,
    status: FeedbackStatus,
    completed: usize,
    total: usize,
    needs_confirmation: bool,
}
impl TaskFeedback {
    fn valid(&self) -> bool {
        !self.task_id.is_empty() && self.task_id.len() <= 200 && self.total <= 32 &&
        self.completed <= self.total && (!self.needs_confirmation || self.status == FeedbackStatus::Paused)
    }
}
#[derive(Default)]
struct FeedbackState {
    value: Option<TaskFeedback>,
    listener: Option<(u64, Channel<Option<TaskFeedback>>)>,
}
#[derive(Default)]
pub struct CompanionFeedbackRuntime {
    state: Mutex<FeedbackState>,
    generation: AtomicU64,
}
fn require_label(actual: &str, expected: &str) -> Result<(), String> {
    if actual == expected { Ok(()) } else { Err("FEEDBACK_WINDOW_DENIED:窗口无权访问此通道".into()) }
}

#[tauri::command]
pub fn companion_feedback_publish(window: WebviewWindow, runtime: State<'_, CompanionFeedbackRuntime>, feedback: Option<TaskFeedback>, topmost: bool) -> Result<(), String> {
    require_label(window.label(), "main")?;
    if feedback.as_ref().is_some_and(|value| !value.valid()) { return Err("FEEDBACK_INVALID:无效任务状态".into()); }
    if let Some(bubble) = window.app_handle().get_webview_window("companion-feedback") {
        bubble.set_always_on_top(topmost).map_err(|_| "FEEDBACK_WINDOW:无法设置窗口层级")?;
    }
    let mut state = runtime.state.lock().map_err(|_| "FEEDBACK_LOCK:状态不可用")?;
    state.value = feedback.clone();
    if let Some((_, channel)) = &state.listener {
        if channel.send(feedback).is_err() { state.listener = None; }
    }
    Ok(())
}

#[tauri::command]
pub fn companion_feedback_subscribe(window: WebviewWindow, runtime: State<'_, CompanionFeedbackRuntime>, on_change: Channel<Option<TaskFeedback>>) -> Result<u64, String> {
    require_label(window.label(), "companion-feedback")?;
    let mut state = runtime.state.lock().map_err(|_| "FEEDBACK_LOCK:状态不可用")?;
    let id = runtime.generation.fetch_add(1, Ordering::SeqCst) + 1;
    on_change.send(state.value.clone()).map_err(|_| "FEEDBACK_CHANNEL:无法发送状态")?;
    state.listener = Some((id, on_change));
    Ok(id)
}

#[tauri::command]
pub fn companion_feedback_unsubscribe(window: WebviewWindow, runtime: State<'_, CompanionFeedbackRuntime>, subscription_id: u64) -> Result<(), String> {
    require_label(window.label(), "companion-feedback")?;
    let mut state = runtime.state.lock().map_err(|_| "FEEDBACK_LOCK:状态不可用")?;
    if state.listener.as_ref().is_some_and(|(id, _)| *id == subscription_id) { state.listener = None; }
    Ok(())
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum FeedbackRequest {
    Details { #[serde(rename = "taskId")] task_id: String },
    Dismiss { #[serde(rename = "taskId")] task_id: String },
    Hover { active: bool },
}
fn request_event(request: &FeedbackRequest, current: Option<&TaskFeedback>) -> Option<(&'static str, serde_json::Value)> {
    let value = current?;
    match request {
        FeedbackRequest::Details { task_id } if *task_id == value.task_id =>
            Some(("companion:feedback-details", serde_json::json!({ "taskId": task_id }))),
        FeedbackRequest::Dismiss { task_id } if *task_id == value.task_id =>
            Some(("companion:feedback-dismiss", serde_json::json!({ "taskId": task_id }))),
        FeedbackRequest::Hover { active } => Some(("companion:feedback-hover", serde_json::json!({ "active": active }))),
        _ => None,
    }
}
#[tauri::command]
pub fn companion_feedback_request(window: WebviewWindow, app: AppHandle, runtime: State<'_, CompanionFeedbackRuntime>, request: FeedbackRequest) -> Result<(), String> {
    require_label(window.label(), "companion-feedback")?;
    let state = runtime.state.lock().map_err(|_| "FEEDBACK_LOCK:状态不可用")?;
    if let Some((event, payload)) = request_event(&request, state.value.as_ref()) {
        app.emit_to("main", event, payload).map_err(|_| "FEEDBACK_EVENT:无法转交请求")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn feedback() -> TaskFeedback {
        TaskFeedback { task_id: "t".into(), status: FeedbackStatus::Running, completed: 0, total: 2, needs_confirmation: false }
    }
    #[test]
    fn permissions_are_label_specific() {
        assert!(require_label("main", "main").is_ok());
        assert!(require_label("companion-feedback", "main").is_err());
        assert!(require_label("main", "companion-feedback").is_err());
        assert!(require_label("companion", "companion-feedback").is_err());
    }
    #[test]
    fn only_current_task_and_fixed_requests_are_forwarded() {
        let value = feedback();
        assert!(request_event(&FeedbackRequest::Details { task_id: "t".into() }, Some(&value)).is_some());
        assert!(request_event(&FeedbackRequest::Details { task_id: "other".into() }, Some(&value)).is_none());
        assert!(request_event(&FeedbackRequest::Hover { active: true }, None).is_none());
        assert!(serde_json::from_str::<FeedbackRequest>(r#"{"kind":"confirm","taskId":"t"}"#).is_err());
        assert!(serde_json::from_str::<FeedbackRequest>(r#"{"kind":"details","taskId":"t","event":"companion:chat-send"}"#).is_err());
    }
    #[test]
    fn status_validation_rejects_fake_progress_and_sensitive_fields() {
        let mut value = feedback();
        assert!(value.valid());
        value.completed = 3;
        assert!(!value.valid());
        value.completed = 0;
        value.needs_confirmation = true;
        assert!(!value.valid());
        assert!(serde_json::from_str::<TaskFeedback>(r#"{"taskId":"t","status":"running","completed":0,"total":2,"needsConfirmation":false,"goal":"private"}"#).is_err());
    }
}
