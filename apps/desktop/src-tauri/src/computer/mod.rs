mod files;
mod policy;
mod processes;
mod recording;
mod types;
mod windows;

use clipboard_win::{get_clipboard_string, set_clipboard_string};
use serde_json::{json, Value};
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_notification::NotificationExt;

pub use types::ComputerRuntime;
use types::{ComputerActionRequest, ComputerPolicy};

fn require_main(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("WINDOW_CAPABILITY_DENIED:电脑能力只能由主窗口的 Agent Runtime 调用".into())
    }
}

fn string<'a>(request: &'a ComputerActionRequest, key: &str) -> Result<&'a str, String> {
    request.params.get(key).and_then(Value::as_str).map(str::trim).filter(|value| !value.is_empty())
        .ok_or_else(|| format!("COMPUTER_ARGUMENT_INVALID:{key}"))
}

fn optional_string<'a>(request: &'a ComputerActionRequest, key: &str) -> Option<&'a str> {
    request.params.get(key).and_then(Value::as_str).map(str::trim).filter(|value| !value.is_empty())
}

fn integer(request: &ComputerActionRequest, key: &str, default: i64) -> i64 {
    request.params.get(key).and_then(Value::as_i64).unwrap_or(default)
}

fn boolean(request: &ComputerActionRequest, key: &str, default: bool) -> bool {
    request.params.get(key).and_then(Value::as_bool).unwrap_or(default)
}

fn strings(request: &ComputerActionRequest, key: &str) -> Result<Vec<String>, String> {
    request.params.get(key).and_then(Value::as_array).map(|items| {
        items.iter().map(|item| item.as_str().map(str::to_string).ok_or_else(|| format!("COMPUTER_ARGUMENT_INVALID:{key}"))).collect()
    }).unwrap_or_else(|| Ok(Vec::new()))
}

fn execute(
    app: &AppHandle,
    runtime: &ComputerRuntime,
    request: &ComputerActionRequest,
    policy: &ComputerPolicy,
    confirmed: bool,
) -> Result<Value, String> {
    policy::authorize(policy, request, confirmed)?;
    runtime.cancelled.store(false, std::sync::atomic::Ordering::SeqCst);
    match request.action.as_str() {
        "app_list" | "window_list" => serde_json::to_value(windows::list_windows().map_err(|error| error.to_string())?).map_err(|error| error.to_string()),
        "app_open" => {
            windows::open_target(string(request, "target")?)?;
            Ok(json!({ "opened": true }))
        }
        "window_focus" => {
            windows::focus_window(string(request, "title")?)?;
            Ok(json!({ "focused": true }))
        }
        "window_close" => {
            windows::close_window(string(request, "title")?)?;
            Ok(json!({ "closed": true }))
        }
        "window_move" => {
            windows::move_window(
                string(request, "title")?,
                integer(request, "x", 0) as i32,
                integer(request, "y", 0) as i32,
                integer(request, "width", 800) as i32,
                integer(request, "height", 600) as i32,
            )?;
            Ok(json!({ "moved": true }))
        }
        "clipboard_read" => get_clipboard_string().map(|text| json!({ "text": text })).map_err(|error| format!("CLIPBOARD_READ:{error}")),
        "clipboard_write" => {
            set_clipboard_string(string(request, "text")?).map_err(|error| format!("CLIPBOARD_WRITE:{error}"))?;
            Ok(json!({ "written": true }))
        }
        "input_click" => {
            windows::click(integer(request, "x", 0) as i32, integer(request, "y", 0) as i32, optional_string(request, "button").unwrap_or("left"))?;
            Ok(json!({ "clicked": true }))
        }
        "input_type_text" => {
            windows::type_text(string(request, "text")?)?;
            Ok(json!({ "typed": true }))
        }
        "input_hotkey" => {
            windows::hotkey(&strings(request, "keys")?)?;
            Ok(json!({ "sent": true }))
        }
        "screen_list_sources" => {
            let windows = windows::list_windows()?;
            Ok(json!({ "sources": [{ "id": "desktop", "label": "整个桌面", "kind": "display" }], "windows": windows }))
        }
        "screen_capture" => recording::capture(policy, string(request, "source")?, optional_string(request, "outputPath"), confirmed),
        "screen_record_start" => recording::start(
            runtime,
            policy,
            string(request, "source")?,
            optional_string(request, "outputPath"),
            integer(request, "fps", 30).clamp(5, 60) as u32,
            optional_string(request, "audioDevice"),
            confirmed,
        ),
        "screen_record_stop" => recording::stop(runtime, string(request, "recordingId")?),
        "screen_record_status" => {
            let (recordings, _) = runtime.statuses();
            Ok(json!({ "recordings": recordings }))
        }
        "file_list" => serde_json::to_value(files::list(policy, string(request, "path")?, boolean(request, "recursive", false), confirmed)?).map_err(|error| error.to_string()),
        "file_search" => serde_json::to_value(files::search(policy, string(request, "path")?, string(request, "query")?, confirmed)?).map_err(|error| error.to_string()),
        "file_read_text" => Ok(json!({ "content": files::read_text(policy, string(request, "path")?, confirmed)? })),
        "file_write_text" => {
            files::write_text(policy, string(request, "path")?, string(request, "content")?, confirmed)?;
            Ok(json!({ "written": true }))
        }
        "file_copy" => Ok(json!({ "bytes": files::copy(policy, string(request, "source")?, string(request, "destination")?, confirmed)? })),
        "file_move" => {
            files::move_file(policy, string(request, "source")?, string(request, "destination")?, confirmed)?;
            Ok(json!({ "moved": true }))
        }
        "file_delete" => {
            files::delete(policy, string(request, "path")?, confirmed)?;
            Ok(json!({ "deleted": true }))
        }
        "process_list" => {
            processes::prune(runtime);
            let (_, processes) = runtime.statuses();
            Ok(json!({ "processes": processes }))
        }
        "process_run" => processes::run(
            runtime,
            string(request, "program")?,
            &strings(request, "args")?,
            optional_string(request, "cwd"),
            integer(request, "timeoutMs", 30_000).clamp(1_000, 600_000) as u64,
            boolean(request, "detached", false),
        ),
        "process_stop" => {
            processes::stop(runtime, string(request, "processId")?)?;
            Ok(json!({ "stopped": true }))
        }
        "shell_run" => processes::shell(
            runtime,
            string(request, "command")?,
            optional_string(request, "cwd"),
            integer(request, "timeoutMs", 30_000).clamp(1_000, 600_000) as u64,
        ),
        "notify" => {
            app.notification().builder().title(string(request, "title")?).body(string(request, "body")?).show()
                .map_err(|error| format!("NOTIFICATION:{error}"))?;
            Ok(json!({ "shown": true }))
        }
        _ => Err(format!("COMPUTER_ACTION_UNKNOWN:{}", request.action)),
    }
}

#[tauri::command]
pub fn computer_execute(
    window: WebviewWindow,
    app: AppHandle,
    runtime: State<'_, ComputerRuntime>,
    request: ComputerActionRequest,
    policy: ComputerPolicy,
    confirmed: bool,
) -> Result<Value, String> {
    require_main(&window)?;
    execute(&app, &runtime, &request, &policy, confirmed)
}

#[tauri::command]
pub fn computer_status(window: WebviewWindow, runtime: State<'_, ComputerRuntime>) -> Result<Value, String> {
    require_main(&window)?;
    processes::prune(&runtime);
    let (recordings, processes) = runtime.statuses();
    Ok(json!({ "recordings": recordings, "processes": processes, "active": runtime.is_active() }))
}

#[tauri::command]
pub fn computer_emergency_stop(window: WebviewWindow, runtime: State<'_, ComputerRuntime>) -> Result<Value, String> {
    require_main(&window)?;
    Ok(json!({ "stopped": runtime.stop_all() }))
}

#[tauri::command]
pub fn computer_detect_ffmpeg(window: WebviewWindow) -> Result<Option<String>, String> {
    require_main(&window)?;
    Ok(recording::detect_ffmpeg(None).map(|path| path.to_string_lossy().into_owned()))
}

pub fn emergency_stop(runtime: &ComputerRuntime) -> usize {
    runtime.stop_all()
}