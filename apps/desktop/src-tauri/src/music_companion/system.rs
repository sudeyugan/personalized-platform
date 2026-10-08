use super::{MediaAction, MediaSnapshot, MusicRuntime};
use base64::Engine;
use std::{sync::atomic::Ordering, thread, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use windows::{
    core::{Error, HRESULT, Result},
    Media::Control::{GlobalSystemMediaTransportControlsSession as Session, GlobalSystemMediaTransportControlsSessionManager as Manager, GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus},
    Storage::Streams::DataReader,
    Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
};

struct Apartment;
impl Apartment { fn new() -> Result<Self> { unsafe { RoInitialize(RO_INIT_MULTITHREADED)?; } Ok(Self) } }
impl Drop for Apartment { fn drop(&mut self) { unsafe { RoUninitialize(); } } }
fn unavailable() -> Error { Error::from_hresult(HRESULT(0x80004005u32 as i32)) }
fn active(runtime: &MusicRuntime, generation: u64) -> bool {
    runtime.enabled.load(Ordering::SeqCst) && runtime.generation.load(Ordering::SeqCst) == generation
}
macro_rules! wait {
    ($operation:expr, $runtime:expr, $generation:expr) => {{
        let operation = $operation?;
        let deadline = Instant::now() + Duration::from_secs(4);
        loop {
            if !active($runtime, $generation) || Instant::now() > deadline {
                let _ = operation.Cancel(); return Err(unavailable());
            }
            if operation.Status()?.0 != 0 { break; }
            thread::sleep(Duration::from_millis(30));
        }
        operation.GetResults()?
    }};
}
fn qq_session(runtime: &MusicRuntime, generation: u64) -> Result<Option<Session>> {
    let manager = wait!(Manager::RequestAsync(), runtime, generation);
    let sessions = manager.GetSessions()?;
    let mut fallback = None;
    for index in 0..sessions.Size()?.min(64) {
        let session = sessions.GetAt(index)?;
        // Never choose a browser/another player's session as a fallback.
        if session.SourceAppUserModelId()?.to_string().eq_ignore_ascii_case("QQMusic.exe") {
            if session.GetPlaybackInfo()?.PlaybackStatus()? == PlaybackStatus::Playing { return Ok(Some(session)); }
            fallback = Some(session);
        }
    }
    Ok(fallback)
}
fn text(value: windows::core::HSTRING) -> String { value.to_string().chars().take(256).collect() }
fn millis(ticks: i64) -> u64 { (ticks.max(0) / 10_000) as u64 }
fn position(ticks: i64, updated: i64, playing: bool, duration: u64, rate: f64) -> u64 {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64;
    let at = updated / 10_000 - 11_644_473_600_000i64;
    // Some players publish position only at pause/seek. LastUpdatedTime anchors interpolation.
    let elapsed = if playing { now.saturating_sub(at).max(0) as f64 * rate.clamp(0.0, 4.0) } else { 0.0 };
    millis(ticks).saturating_add(elapsed as u64).min(duration)
}
pub(super) fn snapshot(cache: &mut Option<(String, Option<String>)>, runtime: &MusicRuntime, generation: u64, known_cover_key: Option<&str>) -> Result<Option<MediaSnapshot>> {
    let _apartment = Apartment::new()?;
    let Some(session) = qq_session(runtime, generation)? else { *cache = None; return Ok(None); };
    let properties = wait!(session.TryGetMediaPropertiesAsync(), runtime, generation);
    let title = text(properties.Title()?);
    if title.trim().is_empty() { *cache = None; return Ok(None); }
    let artist = text(properties.Artist()?); let album = text(properties.AlbumTitle()?);
    let key = serde_json::to_string(&[&title, &artist, &album]).map_err(|_| unavailable())?;
    let cover_unchanged = known_cover_key == Some(key.as_str()) && cache.as_ref().map(|item| &item.0) == Some(&key);
    if cache.as_ref().map(|item| &item.0) != Some(&key) {
        // A thumbnail failure must not hide an otherwise valid song.
        let cover = (|| -> Result<Option<String>> {
            let stream = wait!(properties.Thumbnail()?.OpenReadAsync(), runtime, generation);
            let result = (|| -> Result<Option<String>> {
                let size = stream.Size()?;
                if size == 0 || size > 512 * 1024 { return Ok(None); }
                let input = stream.GetInputStreamAt(0)?;
                let reader = DataReader::CreateDataReader(&input)?;
                let result = (|| -> Result<Option<String>> {
                    let count = wait!(reader.LoadAsync(size as u32), runtime, generation);
                    if count != size as u32 { return Ok(None); }
                    let mut bytes = vec![0; count as usize]; reader.ReadBytes(&mut bytes)?;
                    let mime = if bytes.starts_with(&[0xff, 0xd8, 0xff]) { "image/jpeg" }
                        else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") { "image/png" }
                        else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") { "image/webp" }
                        else { return Ok(None); };
                    Ok(Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))))
                })();
                let _ = reader.Close(); let _ = input.Close(); result
            })();
            let _ = stream.Close(); result
        })().ok().flatten();
        *cache = Some((key, cover));
    }
    let info = session.GetPlaybackInfo()?; let controls = info.Controls()?;
    let timeline = session.GetTimelineProperties()?;
    let playing = info.PlaybackStatus()? == PlaybackStatus::Playing;
    let start = timeline.StartTime()?.Duration;
    let duration = millis(timeline.EndTime()?.Duration.saturating_sub(start));
    let rate = info.PlaybackRate().and_then(|value| value.Value()).unwrap_or(1.0);
    Ok(Some(MediaSnapshot {
        title, artist, album, playing, duration_ms: duration,
        position_ms: position(timeline.Position()?.Duration.saturating_sub(start), timeline.LastUpdatedTime()?.UniversalTime, playing, duration, rate),
        cover: if cover_unchanged { None } else { cache.as_ref().and_then(|item| item.1.clone()) },
        cover_unchanged,
        can_play: controls.IsPlayEnabled()?, can_pause: controls.IsPauseEnabled()?,
        can_previous: controls.IsPreviousEnabled()?, can_next: controls.IsNextEnabled()?,
    }))
}
pub(super) fn control(action: MediaAction, title: &str, artist: &str, runtime: &MusicRuntime, generation: u64) -> Result<()> {
    let _apartment = Apartment::new()?;
    let session = qq_session(runtime, generation)?.ok_or_else(unavailable)?;
    let properties = wait!(session.TryGetMediaPropertiesAsync(), runtime, generation);
    if text(properties.Title()?) != title || text(properties.Artist()?) != artist || !active(runtime, generation) { return Err(unavailable()); }
    let controls = session.GetPlaybackInfo()?.Controls()?;
    let operation = match action {
        MediaAction::Play if controls.IsPlayEnabled()? => session.TryPlayAsync(),
        MediaAction::Pause if controls.IsPauseEnabled()? => session.TryPauseAsync(),
        MediaAction::Previous if controls.IsPreviousEnabled()? => session.TrySkipPreviousAsync(),
        MediaAction::Next if controls.IsNextEnabled()? => session.TrySkipNextAsync(),
        _ => return Err(unavailable()),
    };
    if wait!(operation, runtime, generation) { Ok(()) } else { Err(unavailable()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn paused_position_is_not_interpolated() { assert_eq!(position(20_000_000, 0, false, 10_000, 1.0), 2000); }
    #[test] fn positions_are_clamped() { assert_eq!(position(-50, 0, false, 10_000, 1.0), 0); assert_eq!(position(i64::MAX, 0, true, 10_000, 1.0), 10_000); }
}
