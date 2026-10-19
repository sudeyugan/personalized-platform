use serde_json::Value;
use std::time::Duration;
use tauri::WebviewWindow;

fn endpoint(url: &str, path: &str) -> Result<reqwest::Url, String> {
    if !["/v1/enroll", "/v1/recover", "/v1/invites", "/v1/devices", "/v1/revoke", "/v1/exchange"].contains(&path) {
        return Err("不支持的同步操作".into());
    }
    let base = reqwest::Url::parse(url).map_err(|_| "中枢地址无效")?;
    let loopback = matches!(base.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
    if !(base.scheme() == "https" || base.scheme() == "http" && loopback)
        || !base.username().is_empty() || base.password().is_some()
        || base.query().is_some() || base.fragment().is_some() || base.path() != "/" {
        return Err("中枢必须使用HTTPS源地址；HTTP仅允许本机回环".into());
    }
    base.join(path).map_err(|_| "同步地址无效".into())
}

#[tauri::command]
pub async fn device_sync_request(window: WebviewWindow, url: String, path: String, token: String, body: Value) -> Result<Value, String> {
    if window.label() != "main" { return Err("同步仅限主窗口".into()); }
    let target = endpoint(&url, &path)?;
    if token.len() != 64 || !token.bytes().all(|c| c.is_ascii_hexdigit()) || body.to_string().len() > 2_900_000 {
        return Err("同步凭证或请求大小无效".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .build().map_err(|_| "无法创建安全同步连接")?;
    let mut response = client.post(target).bearer_auth(token).json(&body).send().await.map_err(|_| "无法连接中枢；请检查地址、网络与HTTPS证书。本机资料保留。")?;
    if !response.status().is_success() {
        return Err(if response.status().as_u16() == 401 { "设备凭证失效、邀请已用或设备被撤销" } else { "中枢拒绝本次请求；请检查容量、协议及连接状态" }.into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "同步响应中断")? {
        if bytes.len() + chunk.len() > 2_900_000 { return Err("同步响应超过安全上限".into()); }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "中枢返回格式无效".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_fixed_paths_and_safe_transport() {
        assert!(endpoint("https://my-hub.example/", "/v1/exchange").is_ok());
        assert!(endpoint("http://127.0.0.1:17839", "/v1/enroll").is_ok());
        for url in ["http://192.168.1.2", "https://user:password@example.com", "https://example.com/path", "https://example.com/?a=1", "file:///tmp/test"] {
            assert!(endpoint(url, "/v1/exchange").is_err());
        }
        assert!(endpoint("https://example.com", "/anything").is_err());
    }
}
