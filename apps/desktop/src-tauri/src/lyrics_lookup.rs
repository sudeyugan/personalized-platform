use std::{sync::atomic::{AtomicBool, AtomicU64, Ordering}, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use tauri::{State, WebviewWindow};
#[path = "lyrics_lookup/matching.rs"] mod matching;
#[path = "lyrics_lookup/transport.rs"] mod transport;
#[path = "lyrics_lookup/lrclib.rs"] mod lrclib;
#[path = "lyrics_lookup/qqmusic.rs"] mod qqmusic;
use matching::LyricsResult;
use transport::RequestContext;

#[derive(Default)]
pub struct LyricsRuntime {
    enabled: AtomicBool, qq_enabled: AtomicBool, active: AtomicBool, revision: AtomicU64,
    lrclib_blocked_until: AtomicU64, qq_blocked_until: AtomicU64,
}
fn require_main(label: &str) -> Result<(), String> {
    if label == "main" { Ok(()) } else { Err("WINDOW_CAPABILITY_DENIED:仅主窗口可查询歌词".into()) }
}
fn seconds() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }
fn configure(runtime: &LyricsRuntime, enabled: bool, qq: bool) {
    // Every change revokes in-flight work, including disable -> enable races.
    runtime.revision.fetch_add(1, Ordering::SeqCst);
    runtime.qq_enabled.store(enabled && qq, Ordering::SeqCst);
    runtime.enabled.store(enabled, Ordering::SeqCst);
}
#[tauri::command]
pub fn lyrics_lookup_enable(window: WebviewWindow, runtime: State<'_, LyricsRuntime>, enabled: bool, qq_music: Option<bool>) -> Result<(), String> {
    require_main(window.label())?;
    configure(&runtime, enabled, qq_music.unwrap_or(false)); Ok(())
}
struct Lease<'a>(&'a AtomicBool);
impl Drop for Lease<'_> { fn drop(&mut self) { self.0.store(false, Ordering::SeqCst); } }
fn all_blocked(runtime: &LyricsRuntime, qq: bool) -> Option<u64> {
    let lr = runtime.lrclib_blocked_until.load(Ordering::SeqCst).saturating_sub(seconds());
    let qq_wait = runtime.qq_blocked_until.load(Ordering::SeqCst).saturating_sub(seconds());
    if lr > 0 && (!qq || qq_wait > 0) { Some(if qq { lr.min(qq_wait) } else { lr }) } else { None }
}
async fn lookup(runtime: &LyricsRuntime, title: &str, artist: &str, album: &str, duration: f64) -> Result<LyricsResult, String> {
    let ctx = RequestContext { runtime, revision: runtime.revision.load(Ordering::SeqCst),
        deadline: Instant::now() + Duration::from_secs(25) };
    ctx.check()?;
    let qq = runtime.qq_enabled.load(Ordering::SeqCst);
    if let Some(wait) = all_blocked(runtime, qq) { return Err(format!("LYRICS_RATE_LIMITED:{wait}")); }
    let client = transport::client()?;
    let mut fallback = LyricsResult::empty("not-found", "lrclib");
    let mut failure = None;
    if qq && runtime.qq_blocked_until.load(Ordering::SeqCst) <= seconds() {
        match qqmusic::lookup(&client, &ctx, title, artist, album, duration).await {
            Ok(result) if result.outcome == "matched" => { ctx.check()?; return Ok(result); },
            Ok(result) => fallback = result,
            Err(error) => failure = Some(error),
        }
    }
    ctx.check()?;
    if runtime.lrclib_blocked_until.load(Ordering::SeqCst) <= seconds() {
        match lrclib::lookup(&client, &ctx, title, artist, album, duration).await {
            Ok(result) if result.outcome == "matched" => { ctx.check()?; return Ok(result); },
            Ok(result) if result.outcome != "not-found" => fallback = result,
            Ok(_) => {},
            Err(error) => failure = Some(error),
        }
    }
    ctx.check()?;
    if let Some(wait) = all_blocked(runtime, qq) { return Err(format!("LYRICS_RATE_LIMITED:{wait}")); }
    // A single provider's 429 must never globally pause another available source.
    if fallback.outcome == "not-found" {
        if let Some(error) = failure {
            return Err(if error.starts_with("LYRICS_RATE_LIMITED:") { "LYRICS_SOURCE_UNAVAILABLE".into() } else { error });
        }
    }
    Ok(fallback)
}
#[tauri::command]
pub async fn lyrics_lookup(window: WebviewWindow, runtime: State<'_, LyricsRuntime>, title: String, artist: String, album: String, duration_ms: f64) -> Result<LyricsResult, String> {
    require_main(window.label())?;
    if !runtime.enabled.load(Ordering::SeqCst) { return Err("LYRICS_DISABLED".into()); }
    if title.trim().is_empty() || artist.trim().is_empty() || [&title, &artist, &album].iter().any(|text| text.chars().count() > 256)
        || !duration_ms.is_finite() || !(1000.0..=3_600_000.0).contains(&duration_ms) { return Err("LYRICS_INVALID_METADATA".into()); }
    if runtime.active.swap(true, Ordering::SeqCst) { return Err("LYRICS_BUSY".into()); }
    let _lease = Lease(&runtime.active);
    lookup(&runtime, &title, &artist, &album, duration_ms / 1000.0).await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn only_main() { assert!(require_main("main").is_ok()); assert!(require_main("companion").is_err()); }
    #[test] fn old_requests_stay_revoked_after_reenable() {
        let runtime = LyricsRuntime::default(); configure(&runtime, true, true);
        let ctx = RequestContext { runtime: &runtime, revision: runtime.revision.load(Ordering::SeqCst), deadline: Instant::now() + Duration::from_secs(25) };
        assert!(ctx.check().is_ok()); configure(&runtime, false, false); configure(&runtime, true, true);
        assert!(ctx.check().is_err());
    }
    #[test] fn rate_limits_are_source_local() {
        let runtime = LyricsRuntime::default();
        runtime.qq_blocked_until.store(seconds() + 120, Ordering::SeqCst);
        assert_eq!(all_blocked(&runtime, true), None);
        runtime.lrclib_blocked_until.store(seconds() + 60, Ordering::SeqCst);
        assert!(all_blocked(&runtime, true).is_some_and(|wait| wait <= 60));
        assert!(all_blocked(&runtime, false).is_some());
    }
    #[test] #[ignore]
    fn lrclib_public_read_only_probe() {
        let runtime = LyricsRuntime::default(); configure(&runtime, true, false);
        let result = tauri::async_runtime::block_on(lookup(&runtime, "Hello", "Adele", "25", 295.0)).expect("公开LRCLIB原生连接检查失败");
        assert_eq!(result.outcome, "matched"); assert!(!result.lrc.is_empty());
    }
    #[test] #[ignore]
    fn qqmusic_public_read_only_probe() {
        let runtime = LyricsRuntime::default(); configure(&runtime, true, true);
        // Same public metadata as the user's real QQ session; not a rounded mock duration.
        let result = tauri::async_runtime::block_on(lookup(&runtime, "河流 (Live)", "川川南", "2023中国好声音 第3期", 320.615)).expect("公开QQ歌词原生连接检查失败");
        assert_eq!(result.outcome, "matched"); assert_eq!(result.source, "qqmusic"); assert!(qqmusic::has_timing(&result.lrc));
        println!("QQ Music: anonymous native HTTPS, exact live recording, synced=true; no lyrics printed");
    }
}
