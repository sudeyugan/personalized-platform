#[cfg(target_os = "windows")]
mod system;
#[cfg(all(test, target_os = "windows"))]
mod live_probe;

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, AtomicU64, Ordering}};
use tauri::{State, WebviewWindow};

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSnapshot {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub cover: Option<String>,
    pub cover_unchanged: bool,
    pub can_play: bool,
    pub can_pause: bool,
    pub can_previous: bool,
    pub can_next: bool,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaAction { Play, Pause, Previous, Next }

#[derive(Clone, Default)]
pub struct MusicRuntime {
    enabled: Arc<AtomicBool>,
    controls: Arc<AtomicBool>,
    generation: Arc<AtomicU64>,
    worker: Arc<Mutex<Option<(String, Option<String>)>>>,
}
fn require_main(label: &str) -> Result<(), String> {
    if label == "main" { Ok(()) } else { Err("WINDOW_CAPABILITY_DENIED:伴听只能由主窗口管理".into()) }
}
#[tauri::command]
pub fn music_companion_enable(window: WebviewWindow, runtime: State<'_, MusicRuntime>, enabled: bool, controls: bool) -> Result<(), String> {
    require_main(window.label())?;
    runtime.enabled.store(enabled, Ordering::SeqCst);
    runtime.controls.store(enabled && controls, Ordering::SeqCst);
    runtime.generation.fetch_add(1, Ordering::SeqCst);
    if !enabled { if let Ok(mut cache) = runtime.worker.try_lock() { *cache = None; } }
    // A read in flight cannot publish after a disable/re-enable cycle.
    Ok(())
}
#[tauri::command]
pub async fn music_companion_snapshot(window: WebviewWindow, runtime: State<'_, MusicRuntime>, known_cover_key: Option<String>) -> Result<Option<MediaSnapshot>, String> {
    require_main(window.label())?;
    let runtime = runtime.inner().clone();
    if !runtime.enabled.load(Ordering::SeqCst) { return Ok(None); }
    let generation = runtime.generation.load(Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let mut cache = runtime.worker.try_lock().map_err(|_| "伴听正在读取，请稍后")?;
        #[cfg(target_os = "windows")]
        let result = system::snapshot(&mut cache, &runtime, generation, known_cover_key.as_deref()).map_err(|_| "暂未读到QQ音乐，请确认已开始播放")?;
        #[cfg(not(target_os = "windows"))]
        let result = None;
        if runtime.enabled.load(Ordering::SeqCst) && runtime.generation.load(Ordering::SeqCst) == generation { Ok(result) }
        else { *cache = None; Ok(None) }
    }).await.map_err(|_| "伴听读取未完成".to_string())?
}
#[tauri::command]
pub async fn music_companion_control(window: WebviewWindow, runtime: State<'_, MusicRuntime>, action: MediaAction, expected_title: String, expected_artist: String) -> Result<(), String> {
    require_main(window.label())?;
    let runtime = runtime.inner().clone();
    if !runtime.enabled.load(Ordering::SeqCst) || !runtime.controls.load(Ordering::SeqCst) { return Err("伴听或播放控制已关闭".into()); }
    let generation = runtime.generation.load(Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let _worker = runtime.worker.try_lock().map_err(|_| "伴听正在读取，请稍后重试")?;
        #[cfg(target_os = "windows")]
        { system::control(action, &expected_title, &expected_artist, &runtime, generation).map_err(|_| "QQ音乐未接受此操作，或歌曲已切换，请重试".into()) }
        #[cfg(not(target_os = "windows"))]
        { Err("系统伴听目前仅支持Windows".into()) }
    }).await.map_err(|_| "操作未完成".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn only_main_can_read_or_control() {
        assert!(require_main("main").is_ok());
        for label in ["companion", "companion-chat", "companion-feedback", ""] { assert!(require_main(label).is_err()); }
    }
    #[test] fn controls_are_a_closed_set() {
        assert!(serde_json::from_str::<MediaAction>("\"pause\"").is_ok());
        for value in ["seek", "shell", "volume", "launch"] { assert!(serde_json::from_value::<MediaAction>(serde_json::json!(value)).is_err()); }
    }
}
