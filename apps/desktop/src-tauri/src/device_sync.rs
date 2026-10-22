use serde_json::Value;
use std::time::Duration;
use tauri::WebviewWindow;

const MAX_JSON_BYTES: usize = 2_900_000;

fn endpoint(url: &str, path: &str) -> Result<reqwest::Url, String> {
    if !["/v1/enroll", "/v1/recover", "/v1/invites", "/v1/devices", "/v1/revoke", "/v1/exchange", "/v1/config"].contains(&path) {
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
pub async fn device_sync_request(window: WebviewWindow, url: String, path: String, token: String, body: String) -> Result<String, String> {
    if window.label() != "main" { return Err("同步仅限主窗口".into()); }
    send_json(&url, &path, &token, body).await
}

fn validate_request(token: &str, body: &str) -> Result<(), String> {
    if token.len() != 64 || !token.bytes().all(|c| c.is_ascii_hexdigit()) || body.len() > MAX_JSON_BYTES {
        return Err("同步凭证或请求大小无效".into());
    }
    serde_json::from_str::<Value>(body).map_err(|_| "同步请求JSON无效；未发送。")?;
    Ok(())
}

fn response_json(bytes: Vec<u8>) -> Result<String, String> {
    if bytes.len() > MAX_JSON_BYTES { return Err("同步响应超过安全上限".into()); }
    serde_json::from_slice::<Value>(&bytes).map_err(|_| "中枢返回格式无效")?;
    String::from_utf8(bytes).map_err(|_| "中枢返回格式无效".into())
}

async fn send_json(url: &str, path: &str, token: &str, body: String) -> Result<String, String> {
    let target = endpoint(url, path)?;
    validate_request(token, &body)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .build().map_err(|_| "无法创建安全同步连接")?;
    // serde_json::Value sorts object fields. Parsing is validation only: preserve
    // the original request and response text for HMAC and device-code agreement.
    let mut response = client.post(target).bearer_auth(token)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body).send().await.map_err(|_| "无法连接中枢；请检查地址、网络与HTTPS证书。本机资料保留。")?;
    if !response.status().is_success() {
        return Err(if response.status().as_u16() == 401 { "设备凭证失效、邀请已用或设备被撤销" } else { "中枢拒绝本次请求；请检查容量、协议及连接状态" }.into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "同步响应中断")? {
        if bytes.len() + chunk.len() > MAX_JSON_BYTES { return Err("同步响应超过安全上限".into()); }
        bytes.extend_from_slice(&chunk);
    }
    response_json(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    #[test]
    fn only_fixed_paths_and_safe_transport() {
        assert!(endpoint("https://my-hub.example/", "/v1/exchange").is_ok());
        assert!(endpoint("http://127.0.0.1:17839", "/v1/enroll").is_ok());
        for url in ["http://192.168.1.2", "https://user:password@example.com", "https://example.com/path", "https://example.com/?a=1", "file:///tmp/test"] {
            assert!(endpoint(url, "/v1/exchange").is_err());
        }
        assert!(endpoint("https://example.com", "/anything").is_err());
    }

    #[test]
    fn validates_json_credentials_and_utf8_limits_without_reencoding() {
        let token = "a".repeat(64);
        let raw = r#"{"z":"手机","a":{"v":1,"id":"fixture"}}"#;
        assert!(validate_request(&token, raw).is_ok());
        assert_ne!(serde_json::from_str::<Value>(raw).unwrap().to_string(), raw);
        for invalid in ["not-json", "{", "{} trailing"] {
            assert!(validate_request(&token, invalid).is_err());
        }
        assert!(validate_request("invalid", "{}").is_err());
        assert!(validate_request(&"g".repeat(64), "{}").is_err());
        let at_limit = format!("\"{}\"", "中".repeat((MAX_JSON_BYTES - 2) / 3));
        assert_eq!(at_limit.len(), MAX_JSON_BYTES);
        assert!(validate_request(&token, &at_limit).is_ok());
        let oversized = format!("\"{}\"", "中".repeat(MAX_JSON_BYTES / 3 + 1));
        assert!(validate_request(&token, &oversized).is_err());
    }

    #[test]
    fn response_keeps_order_whitespace_and_escaping_but_rejects_invalid_json() {
        let raw = r#" {"z":"手机","nested":{"b":2,"a":"\u4e00"}} "#;
        assert_eq!(response_json(raw.as_bytes().to_vec()).unwrap(), raw);
        assert!(response_json(b"not-json".to_vec()).is_err());
        assert!(response_json(vec![0xff]).is_err());
        assert!(response_json(vec![b' '; MAX_JSON_BYTES + 1]).is_err());
    }

    #[test]
    fn native_http_roundtrip_preserves_signed_json_bytes() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let outgoing = r#"{"operation":"request","request":{"value":{"v":1,"name":"手机","expires":123},"mac":"fixture"}}"#;
        let incoming = r#"{"channels":[{"request":{"value":{"v":1,"name":"手机","expires":123},"mac":"fixture"},"source":null}]}"#;
        let server = std::thread::spawn(move || {
            let start = std::time::Instant::now();
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(start.elapsed() < Duration::from_secs(5), "fixture accept timeout");
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("fixture accept: {error}"),
                }
            };
            stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            let mut received = Vec::new();
            let mut buffer = [0u8; 1024];
            let (header_end, content_length) = loop {
                let count = stream.read(&mut buffer).unwrap();
                assert!(count > 0);
                received.extend_from_slice(&buffer[..count]);
                if let Some(end) = received.windows(4).position(|part| part == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&received[..end]).to_lowercase();
                    assert!(headers.starts_with("post /v1/config http/1.1"));
                    assert!(headers.contains("content-type: application/json"));
                    let length = headers.lines().find_map(|line| line.strip_prefix("content-length:")).unwrap().trim().parse::<usize>().unwrap();
                    break (end + 4, length);
                }
            };
            while received.len() - header_end < content_length {
                let count = stream.read(&mut buffer).unwrap();
                assert!(count > 0);
                received.extend_from_slice(&buffer[..count]);
            }
            assert_eq!(&received[header_end..header_end + content_length], outgoing.as_bytes());
            write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", incoming.len(), incoming).unwrap();
        });
        let result = tauri::async_runtime::block_on(send_json(
            &format!("http://{address}"), "/v1/config", &"a".repeat(64), outgoing.to_owned(),
        ));
        server.join().unwrap();
        assert_eq!(result.unwrap(), incoming);
    }
}
