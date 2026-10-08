use serde::{Deserialize, Serialize};
use std::sync::{atomic::{AtomicU64, Ordering}, Mutex};
use tauri::{ipc::Channel, AppHandle, Emitter, State, WebviewWindow};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LyricLine { at: f64, text: String }
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LyricTrack { key: String, title: String, artist: String, lines: Vec<LyricLine> }
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LyricTick {
    key: String, position: f64, playing: bool, offset_ms: f64, status: String,
    reader: bool, pinned: bool, through: bool, font_size: u32, opacity: u32,
    pixel: bool, busy: bool, controls: bool, can_play: bool, can_pause: bool, can_previous: bool, can_next: bool,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum LyricPacket { Track { track: LyricTrack }, Tick { tick: LyricTick }, Clear }
#[derive(Default)]
struct StateValue { track: Option<LyricTrack>, tick: Option<LyricTick>, listener: Option<(u64, Channel<LyricPacket>)> }
#[derive(Default)]
pub struct CompanionLyricsRuntime { state: Mutex<StateValue>, generation: AtomicU64 }
fn require_label(actual: &str, expected: &str) -> Result<(), String> {
    if actual == expected { Ok(()) } else { Err("LYRICS_WINDOW_DENIED:窗口无权访问此通道".into()) }
}
impl LyricTrack {
    fn valid(&self) -> bool {
        if self.key.is_empty() || self.key.len() > 4096 || self.title.len() > 2048 || self.artist.len() > 2048 || self.lines.len() > 5000 { return false; }
        let mut previous = 0.0;
        self.lines.iter().all(|line| {
            let valid = line.at.is_finite() && line.at >= previous && line.at <= 14_400_000.0 && line.text.chars().count() <= 300;
            previous = line.at; valid
        })
    }
}
impl LyricTick {
    fn valid(&self) -> bool {
        !self.key.is_empty() && self.key.len() <= 4096 && self.position.is_finite() && (-10_000.0..=14_410_000.0).contains(&self.position)
            && self.offset_ms.is_finite() && self.offset_ms.abs() <= 10_000.0 && (12..=28).contains(&self.font_size)
            && (35..=100).contains(&self.opacity) && self.status.len() <= 1024
    }
}
#[tauri::command]
pub fn companion_lyrics_publish(window: WebviewWindow, runtime: State<'_, CompanionLyricsRuntime>, packet: LyricPacket) -> Result<(), String> {
    require_label(window.label(), "main")?;
    let mut state = runtime.state.lock().map_err(|_| "LYRICS_LOCK")?;
    match &packet {
        LyricPacket::Track { track } => {
            if !track.valid() { return Err("LYRICS_INVALID:歌曲无效".into()); }
            if state.track.as_ref().is_none_or(|current| current.key != track.key) { state.tick = None; }
            state.track = Some(track.clone());
        }
        LyricPacket::Tick { tick } => {
            if !tick.valid() || state.track.as_ref().is_none_or(|track| track.key != tick.key) { return Err("LYRICS_INVALID:歌曲已切换".into()); }
            state.tick = Some(tick.clone());
        }
        LyricPacket::Clear => { state.track = None; state.tick = None; }
    }
    if let Some((_, channel)) = &state.listener { if channel.send(packet).is_err() { state.listener = None; } }
    Ok(())
}
#[tauri::command]
pub fn companion_lyrics_subscribe(window: WebviewWindow, runtime: State<'_, CompanionLyricsRuntime>, on_change: Channel<LyricPacket>) -> Result<u64, String> {
    require_label(window.label(), "companion-lyrics")?;
    let mut state = runtime.state.lock().map_err(|_| "LYRICS_LOCK")?;
    if let Some(track) = &state.track { on_change.send(LyricPacket::Track { track: track.clone() }).map_err(|_| "LYRICS_CHANNEL")?; }
    if let Some(tick) = &state.tick { on_change.send(LyricPacket::Tick { tick: tick.clone() }).map_err(|_| "LYRICS_CHANNEL")?; }
    let id = runtime.generation.fetch_add(1, Ordering::SeqCst) + 1;
    state.listener = Some((id, on_change)); Ok(id)
}
#[tauri::command]
pub fn companion_lyrics_unsubscribe(window: WebviewWindow, runtime: State<'_, CompanionLyricsRuntime>, subscription_id: u64) -> Result<(), String> {
    require_label(window.label(), "companion-lyrics")?;
    let mut state = runtime.state.lock().map_err(|_| "LYRICS_LOCK")?;
    if state.listener.as_ref().is_some_and(|(id, _)| *id == subscription_id) { state.listener = None; } Ok(())
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LyricControl { Play, Pause, Previous, Next }
#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum LyricRequest {
    View { key: String, reader: bool }, Pin { key: String, pinned: bool }, Through { key: String, enabled: bool },
    Offset { key: String, #[serde(rename = "deltaMs")] delta_ms: i32 }, Font { key: String, delta: i32 },
    Opacity { key: String, delta: i32 }, Close { key: String }, Control { key: String, action: LyricControl },
}
impl LyricRequest {
    fn allowed(&self, tick: &LyricTick) -> bool {
        let (key, valid) = match self {
            Self::View { key, .. } | Self::Pin { key, .. } | Self::Through { key, .. } | Self::Close { key } => (key, true),
            Self::Offset { key, delta_ms } => (key, [-100, 100, 0].contains(delta_ms)),
            Self::Font { key, delta } => (key, [-1, 1].contains(delta)),
            Self::Opacity { key, delta } => (key, [-5, 5].contains(delta)),
            Self::Control { key, action } => (key, tick.controls && match action {
                LyricControl::Play => tick.can_play, LyricControl::Pause => tick.can_pause,
                LyricControl::Previous => tick.can_previous, LyricControl::Next => tick.can_next,
            }),
        }; valid && *key == tick.key
    }
}
#[tauri::command]
pub fn companion_lyrics_request(window: WebviewWindow, app: AppHandle, runtime: State<'_, CompanionLyricsRuntime>, request: LyricRequest) -> Result<(), String> {
    require_label(window.label(), "companion-lyrics")?;
    let state = runtime.state.lock().map_err(|_| "LYRICS_LOCK")?;
    if state.tick.as_ref().is_some_and(|tick| request.allowed(tick)) { app.emit_to("main", "companion:lyrics-request", request).map_err(|_| "LYRICS_EVENT")?; } Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn labels_and_current_track_are_required() {
        assert!(require_label("main", "main").is_ok());
        assert!(require_label("companion-lyrics", "main").is_err());
        assert!(require_label("companion-chat", "companion-lyrics").is_err());
        let tick: LyricTick = serde_json::from_value(serde_json::json!({"key":"a","position":0,"playing":true,"offsetMs":0,"status":"","reader":false,"pinned":false,"through":false,"fontSize":16,"opacity":90,"pixel":true,"busy":false,"controls":false,"canPlay":true,"canPause":true,"canNext":true,"canPrevious":true})).unwrap();
        assert!(tick.valid());
        assert!(LyricRequest::View { key:"a".into(), reader:true }.allowed(&tick));
        assert!(!LyricRequest::View { key:"old".into(), reader:true }.allowed(&tick));
        assert!(!LyricRequest::Offset { key:"a".into(), delta_ms:10000 }.allowed(&tick));
        assert!(!LyricRequest::Control { key:"a".into(), action:LyricControl::Play }.allowed(&tick));
    }
    #[test]
    fn protocol_is_bounded_and_has_no_arbitrary_events_or_private_fields() {
        assert!(serde_json::from_str::<LyricRequest>(r#"{"kind":"event","key":"a","event":"companion:chat-send"}"#).is_err());
        assert!(serde_json::from_str::<LyricRequest>(r#"{"kind":"view","key":"a","reader":true,"secret":"x"}"#).is_err());
        let mut track = LyricTrack { key:"a".into(), title:"song".into(), artist:"artist".into(), lines:vec![LyricLine { at:0.0, text:"one".into() }] };
        assert!(track.valid()); track.lines[0].at = f64::NAN; assert!(!track.valid());
        track.lines = vec![LyricLine { at:0.0, text:"x".repeat(301) }]; assert!(!track.valid());
    }
}
