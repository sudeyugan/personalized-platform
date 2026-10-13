mod policy;
mod http;
mod html;
mod bilibili;
#[cfg(test)] mod tests;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::WebviewWindow;

static READING: AtomicBool = AtomicBool::new(false);
struct ReadLease;
impl Drop for ReadLease { fn drop(&mut self) { READING.store(false, Ordering::Release); } }

fn begin(window: &WebviewWindow, approved: bool) -> Result<ReadLease, String> {
    if window.label() != "main" || !approved { return Err("PUBLIC_WEB_PERMISSION:公开读取需要主窗口逐目标确认".into()); }
    READING.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| "PUBLIC_WEB_BUSY:另一条公开读取尚未结束")?;
    Ok(ReadLease)
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReadKind { Page, Json }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    url: String, fetched_at_epoch_ms: u64, content_type: String, cached: bool,
    untrusted: bool, truncated: bool, title: Option<String>, text: Option<String>,
    links: Vec<html::PageLink>, data: Option<Value>,
}

async fn read(raw: &str, kind: ReadKind, pointer: Option<&str>) -> Result<ReadResult, String> {
    if pointer.is_some_and(|path| path.len() > 512 || (!path.is_empty() && !path.starts_with('/'))) { return Err("PUBLIC_WEB_POINTER:使用JSON Pointer路径，例如/data，不执行表达式".into()); }
    let response = http::fetch(raw).await?;
    decode_response(response, kind, pointer)
}

fn decode_response(response: http::PublicResponse, kind: ReadKind, pointer: Option<&str>) -> Result<ReadResult, String> {
    let mut result = ReadResult { url: response.url.clone(), fetched_at_epoch_ms: http::now_ms(), content_type: response.content_type.clone(), cached: response.cached, untrusted: true, truncated: false, title: None, text: None, links: vec![], data: None };
    match kind {
        ReadKind::Page => {
            if response.content_type == "text/html" {
                let page = html::extract(&response.text, &reqwest::Url::parse(&response.url).map_err(|_| "PUBLIC_WEB_URL:无效来源")?);
                result.title = Some(page.title); result.text = Some(page.text); result.links = page.links; result.truncated = page.truncated;
            } else if response.content_type == "text/plain" {
                result.truncated = response.text.chars().count() > 12000;
                result.text = Some(response.text.chars().take(12000).collect());
            } else { return Err("PUBLIC_WEB_TYPE:这是JSON来源，请使用web.read_json".into()); }
        }
        ReadKind::Json => {
            if response.content_type != "application/json" && !response.content_type.ends_with("+json") { return Err("PUBLIC_WEB_TYPE:来源没有返回JSON".into()); }
            let data: Value = serde_json::from_str(&response.text).map_err(|_| "PUBLIC_WEB_JSON:来源不是有效JSON")?;
            let selected = match pointer.filter(|path| !path.is_empty()) { Some(path) => data.pointer(path).ok_or("PUBLIC_WEB_POINTER:来源没有这个JSON路径")?, None => &data };
            let text = serde_json::to_string(selected).map_err(|_| "PUBLIC_WEB_JSON:数据无法解析")?;
            result.truncated = text.chars().count() > 12000;
            if result.truncated { result.text = Some(text.chars().take(12000).collect()); }
            else { result.data = Some(selected.clone()); }
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn public_web_read(window: WebviewWindow, url: String, kind: ReadKind, pointer: Option<String>, approved: bool) -> Result<ReadResult, String> {
    let _lease = begin(&window, approved)?;
    read(&url, kind, pointer.as_deref()).await
}

#[tauri::command]
pub async fn public_web_live_status(window: WebviewWindow, room_url: String, expected_name: String, approved: bool) -> Result<bilibili::LiveStatus, String> {
    let _lease = begin(&window, approved)?;
    bilibili::query(&room_url, &expected_name).await
}
