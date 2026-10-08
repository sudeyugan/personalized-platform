use reqwest::{Client, RequestBuilder, Response, redirect::Policy};
use std::{sync::atomic::Ordering, time::{Duration, Instant}};
use super::{LyricsRuntime, seconds};

pub(super) struct RequestContext<'a> {
    pub runtime: &'a LyricsRuntime, pub revision: u64, pub deadline: Instant,
}
impl RequestContext<'_> {
    pub fn check(&self) -> Result<(), String> {
        if !self.runtime.enabled.load(Ordering::SeqCst) || self.runtime.revision.load(Ordering::SeqCst) != self.revision {
            return Err("LYRICS_DISABLED".into());
        }
        if Instant::now() >= self.deadline { return Err("LYRICS_TIMEOUT".into()); }
        Ok(())
    }
}
pub(super) fn client() -> Result<Client, String> {
    Client::builder().https_only(true).redirect(Policy::none()).timeout(Duration::from_secs(12))
        .connect_timeout(Duration::from_secs(5))
        .user_agent("Yiyu/2.0 (personal-lyrics-cache; https://github.com/sudeyugan/personalized-platform)")
        .build().map_err(|_| "LYRICS_REQUEST_FAILED".into())
}
fn request_error(error: reqwest::Error) -> String {
    if error.is_timeout() { "LYRICS_TIMEOUT" } else { "LYRICS_REQUEST_FAILED" }.into()
}
pub(super) async fn read(request: RequestBuilder, ctx: &RequestContext<'_>, qq: bool) -> Result<Option<Vec<u8>>, String> {
    ctx.check()?;
    if qq && !ctx.runtime.qq_enabled.load(Ordering::SeqCst) { return Err("LYRICS_DISABLED".into()); }
    let response = request.timeout(ctx.deadline.saturating_duration_since(Instant::now()).min(Duration::from_secs(12)))
        .send().await.map_err(request_error)?;
    body(response, ctx, qq).await
}
async fn body(mut response: Response, ctx: &RequestContext<'_>, qq: bool) -> Result<Option<Vec<u8>>, String> {
    ctx.check()?;
    if response.status().as_u16() == 404 { return Ok(None); }
    if response.status().as_u16() == 429 {
        let wait = response.headers().get(reqwest::header::RETRY_AFTER).and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok()).unwrap_or(900).clamp(1, 86400);
        let blocked = if qq { &ctx.runtime.qq_blocked_until } else { &ctx.runtime.lrclib_blocked_until };
        blocked.store(seconds().saturating_add(wait), Ordering::SeqCst);
        return Err(format!("LYRICS_RATE_LIMITED:{wait}"));
    }
    if !response.status().is_success() { return Err("LYRICS_SOURCE_UNAVAILABLE".into()); }
    const LIMIT: usize = 1_000_000;
    let announced = response.headers().get(reqwest::header::CONTENT_LENGTH).and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<u64>().ok());
    if announced.is_some_and(|n| n > LIMIT as u64) || response.content_length().is_some_and(|n| n > LIMIT as u64) { return Err("LYRICS_TOO_LARGE".into()); }
    let mut data = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(request_error)? {
        ctx.check()?;
        if data.len() + chunk.len() > LIMIT { return Err("LYRICS_TOO_LARGE".into()); }
        data.extend_from_slice(&chunk);
    }
    ctx.check()?; Ok(Some(data))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn declared_and_actual_oversize_and_redirects_are_rejected() {
        let runtime = LyricsRuntime::default(); super::super::configure(&runtime, true, false);
        let ctx = RequestContext { runtime: &runtime, revision: runtime.revision.load(Ordering::SeqCst), deadline: Instant::now() + Duration::from_secs(25) };
        tauri::async_runtime::block_on(async {
            let declared = tauri::http::Response::builder().status(200).header("content-length", "1000001").body("small").unwrap().into();
            assert_eq!(body(declared, &ctx, false).await.unwrap_err(), "LYRICS_TOO_LARGE");
            let actual = tauri::http::Response::builder().status(200).body(vec![b'x'; 1_000_001]).unwrap().into();
            assert_eq!(body(actual, &ctx, false).await.unwrap_err(), "LYRICS_TOO_LARGE");
            let redirect = tauri::http::Response::builder().status(302).body("redirect").unwrap().into();
            assert_eq!(body(redirect, &ctx, false).await.unwrap_err(), "LYRICS_SOURCE_UNAVAILABLE");
            let missing = tauri::http::Response::builder().status(404).body("missing").unwrap().into();
            assert!(body(missing, &ctx, false).await.unwrap().is_none());
        });
    }
    #[test] fn a_429_changes_only_its_source_cooldown() {
        let runtime = LyricsRuntime::default(); super::super::configure(&runtime, true, true);
        let ctx = RequestContext { runtime: &runtime, revision: runtime.revision.load(Ordering::SeqCst), deadline: Instant::now() + Duration::from_secs(25) };
        let response = tauri::http::Response::builder().status(429).header("retry-after", "60").body("").unwrap().into();
        assert_eq!(tauri::async_runtime::block_on(body(response, &ctx, true)).unwrap_err(), "LYRICS_RATE_LIMITED:60");
        assert!(runtime.qq_blocked_until.load(Ordering::SeqCst) > seconds());
        assert_eq!(runtime.lrclib_blocked_until.load(Ordering::SeqCst), 0);
    }
    #[test] fn expired_or_revoked_context_cannot_consume_response() {
        let runtime = LyricsRuntime::default(); super::super::configure(&runtime, true, true);
        let ctx = RequestContext { runtime: &runtime, revision: runtime.revision.load(Ordering::SeqCst), deadline: Instant::now() };
        assert_eq!(ctx.check().unwrap_err(), "LYRICS_TIMEOUT");
        let ctx = RequestContext { deadline: Instant::now() + Duration::from_secs(25), ..ctx };
        super::super::configure(&runtime, true, false);
        let response = tauri::http::Response::new("stale").into();
        assert_eq!(tauri::async_runtime::block_on(body(response, &ctx, true)).unwrap_err(), "LYRICS_DISABLED");
    }
}
