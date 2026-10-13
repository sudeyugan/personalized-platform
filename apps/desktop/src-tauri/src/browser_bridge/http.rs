use std::{collections::HashMap, io::{Read, Write}, net::TcpStream, time::{Duration, Instant}};
use serde_json::Value;
use super::policy::{MAX_BODY, PORT};

pub struct HttpRequest { pub method: String, pub path: String, pub origin: String, pub token: String, pub body: Value }
pub fn parse(headers: &str) -> Result<(String, String, HashMap<String, String>, usize), String> {
    parse_at_port(headers, PORT)
}
fn parse_at_port(headers: &str, expected_port: u16) -> Result<(String, String, HashMap<String, String>, usize), String> {
    let mut lines = headers.split("\r\n");
    let words: Vec<_> = lines.next().unwrap_or("").split(' ').collect();
    if words.len() != 3 || words[2] != "HTTP/1.1" || !["POST", "OPTIONS"].contains(&words[0]) || !["/pair", "/poll", "/reply", "/setup", "/active"].contains(&words[1]) { return Err("BROWSER_HTTP:不支持的请求".into()); }
    let mut values = HashMap::new();
    for line in lines.filter(|line| !line.is_empty()) {
        let (name, value) = line.split_once(':').ok_or("BROWSER_HTTP:无效请求头")?;
        let name = name.trim().to_ascii_lowercase();
        if values.insert(name, value.trim().to_owned()).is_some() { return Err("BROWSER_HTTP:重复请求头".into()); }
    }
    if values.get("host").map(String::as_str) != Some(&format!("127.0.0.1:{expected_port}")) || values.contains_key("transfer-encoding") { return Err("BROWSER_HTTP:只允许直接本机连接".into()); }
    let declared = values.get("x-yiyu-extension").or_else(|| values.get("origin")).map(String::as_str).unwrap_or("");
    if !super::policy::extension_origin(declared) || values.get("origin").is_some_and(|origin| origin != declared) { return Err("BROWSER_HTTP:网页不能连接浏览器桥接".into()); }
    let length = values.get("content-length").map(|value| value.parse::<usize>()).transpose().map_err(|_| "BROWSER_HTTP:无效长度")?.unwrap_or(0);
    if length > MAX_BODY || (words[0] == "POST" && (!values.get("content-type").is_some_and(|value| value.starts_with("application/json")) || length == 0)) { return Err("BROWSER_HTTP:请求类型或大小不允许".into()); }
    Ok((words[0].into(), words[1].into(), values, length))
}
pub fn receive(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    receive_at_port(stream, PORT)
}
#[cfg(test)]
pub fn receive_fixture(stream: &mut TcpStream, port:u16) -> Result<HttpRequest, String> { receive_at_port(stream,port) }
fn receive_at_port(stream: &mut TcpStream, expected_port:u16) -> Result<HttpRequest, String> {
    let started = Instant::now(); let mut bytes = vec![]; let mut buffer = [0_u8; 2048];
    let end = loop {
        stream.set_read_timeout(Some(Duration::from_secs(2).saturating_sub(started.elapsed()).max(Duration::from_millis(1)))).map_err(|_| "BROWSER_HTTP:无法设置时限")?;
        if started.elapsed() >= Duration::from_secs(2) { return Err("BROWSER_HTTP:读取超时".into()); }
        let n = stream.read(&mut buffer).map_err(|_| "BROWSER_HTTP:读取失败")?;
        if n == 0 { return Err("BROWSER_HTTP:请求提前关闭".into()); }
        bytes.extend_from_slice(&buffer[..n]);
        if let Some(end) = bytes.windows(4).position(|part| part == b"\r\n\r\n") { if end > 8192 { return Err("BROWSER_HTTP:请求头过长".into()); } break end + 4; }
        if bytes.len() > 8192 { return Err("BROWSER_HTTP:请求头过长".into()); }
    };
    let headers = std::str::from_utf8(&bytes[..end]).map_err(|_| "BROWSER_HTTP:无效编码")?;
    let (method, path, values, length) = if expected_port==PORT { parse(headers)? } else { parse_at_port(headers,expected_port)? };
    while bytes.len() < end + length {
        if started.elapsed() >= Duration::from_secs(2) { return Err("BROWSER_HTTP:读取超时".into()); }
        stream.set_read_timeout(Some(Duration::from_secs(2).saturating_sub(started.elapsed()).max(Duration::from_millis(1)))).map_err(|_| "BROWSER_HTTP:无法设置时限")?;
        let n = stream.read(&mut buffer).map_err(|_| "BROWSER_HTTP:读取失败")?;
        if n == 0 { return Err("BROWSER_HTTP:正文提前关闭".into()); } bytes.extend_from_slice(&buffer[..n]);
    }
    if bytes.len() != end + length { return Err("BROWSER_HTTP:不支持流水线请求".into()); }
    let body = if method == "OPTIONS" { Value::Null } else { serde_json::from_slice(&bytes[end..]).map_err(|_| "BROWSER_HTTP:正文不是JSON")? };
    Ok(HttpRequest { method, path, origin: values.get("x-yiyu-extension").or_else(|| values.get("origin")).unwrap().clone(), token: values.get("authorization").and_then(|value| value.strip_prefix("Bearer ")).unwrap_or("").to_owned(), body })
}
pub fn respond(stream: &mut TcpStream, origin: Option<&str>, result: Result<Value, String>) {
    let (status, body) = match result { Ok(value) => ("200 OK", value), Err(_) => ("403 Forbidden", serde_json::json!({"error":"连接未授权、已失效或请求无效"})) };
    let body = body.to_string();
    let cors = origin.filter(|origin| super::policy::extension_origin(origin)).map(|origin| format!("Access-Control-Allow-Origin: {origin}\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Authorization, Content-Type, X-Yiyu-Extension\r\nVary: Origin\r\n")).unwrap_or_default();
    let response = format!("HTTP/1.1 {status}\r\n{cors}Content-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}", body.len());
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2))); let _ = stream.write_all(response.as_bytes());
}
#[cfg(test)] mod tests {
    use super::*;
    fn headers(extra: &str) -> String { format!("POST /poll HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\nOrigin: chrome-extension://abcdefghijklmnopabcdefghijklmnop\r\nContent-Type: application/json\r\nContent-Length: 2\r\n{extra}\r\n") }
    #[test] fn rejects_rebinding_duplicates_and_oversized_body() {
        assert!(parse(&headers("")).is_ok());
        for bad in [headers("Host: evil.com\r\n"),headers("Transfer-Encoding: chunked\r\n"),headers("").replace("127.0.0.1", "evil.local"),headers("").replace("Content-Length: 2", "Content-Length: 999999"),headers("").replace("chrome-extension://abcdefghijklmnopabcdefghijklmnop", "https://evil.com"),headers("").replace("POST /poll", "GET /poll")] { assert!(parse(&bad).is_err()); }
    }
    #[test] fn active_task_route_is_accepted_before_authenticated_dispatch() {
        for method in ["POST", "OPTIONS"] {
            assert!(parse(&headers("").replace("POST /poll", &format!("{method} /active"))).is_ok(), "current-task check must reach authenticated dispatcher");
        }
        for path in ["/active/", "/active?token=secret", "/active_other", "/arbitrary"] {
            assert!(parse(&headers("").replace("/poll",path)).is_err());
        }
    }
}
