use reqwest::Url;
use tauri::{State, WebviewWindow};
use super::{ComputerRuntime, windows};

fn validated_url(label: &str, raw: &str) -> Result<Url, String> {
    if !matches!(label, "main" | "companion-chat") {
        return Err("REPLY_LINK_WINDOW_DENIED".into());
    }
    let url = Url::parse(raw).map_err(|_| "REPLY_LINK_INVALID")?;
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    if raw.len() > 2048 || raw.chars().any(|c| c.is_control() || c.is_whitespace())
        || url.scheme() != "https" || !url.username().is_empty() || url.password().is_some()
        || url.port().is_some() || !host.contains('.') || host.ends_with('.')
        || host.parse::<std::net::IpAddr>().is_ok() || host.contains(':')
        || [".local", ".localhost", ".internal", ".test", ".invalid"].iter().any(|suffix| host.ends_with(suffix)) {
        return Err("REPLY_LINK_INVALID".into());
    }
    for (key, _) in url.query_pairs() {
        let key = key.to_ascii_lowercase();
        if ["token", "secret", "password", "passwd", "authorization", "api_key", "apikey", "access_key", "session", "cookie", "signature", "credential"].iter().any(|name| key.contains(name)) {
            return Err("REPLY_LINK_PRIVATE".into());
        }
    }
    Ok(url)
}

// Dedicated UI affordance. Never register as an Agent tool, accept a command,
// load a URL in the privileged WebView, or grant website/credential access.
#[tauri::command]
pub fn open_reply_link(window: WebviewWindow, runtime: State<'_, ComputerRuntime>, url: String) -> Result<(), String> {
    let url = validated_url(window.label(), &url)?;
    let _desktop = runtime.desktop_operation.lock().map_err(|_| "REPLY_LINK_BUSY")?;
    if runtime.takeover.lock().map_err(|_| "REPLY_LINK_BUSY")?.as_ref()
        .is_some_and(|session| session.expires > std::time::Instant::now()) {
        return Err("REPLY_LINK_BUSY".into());
    }
    windows::open_target(url.as_str()).map(|_| ()).map_err(|_| "REPLY_LINK_OPEN_FAILED".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_chat_windows_can_open_web_links() {
        for label in ["main", "companion-chat"] {
            assert_eq!(validated_url(label, "https://live.bilibili.com/123#section").unwrap().as_str(), "https://live.bilibili.com/123#section");
        }
        for label in ["", "companion", "companion-feedback", "companion-lyrics", "other"] {
            assert!(validated_url(label, "https://example.com").is_err());
        }
    }
    #[test]
    fn rejects_unsafe_targets_and_private_parameters() {
        for url in ["file:///C:/app.exe", "javascript:alert(1)", "ms-edge:https://example.com", "C:\\app.exe", "http://example.com", "https://user:pass@example.com", "https://example.com:8443", "https://127.0.0.1", "https://[::1]", "https://localhost", "https://x.local", "https://x.invalid", "https://example.com\n", "https://example.com/?access_token=fictional", "https://example.com/?%70assword=fictional"] {
            assert!(validated_url("main", url).is_err(), "{url}");
        }
        assert!(validated_url("main", &format!("https://example.com/{}", "x".repeat(2048))).is_err());
        assert!(validated_url("main", "https://example.com/search?q=hello").is_ok());
    }
}
