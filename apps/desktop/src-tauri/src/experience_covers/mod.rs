mod http;
mod providers;
mod links;
#[cfg(test)]
mod tests;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use tauri::{AppHandle, State, WebviewWindow};
use crate::repositories::SecretRepository;

#[derive(Default)]
pub struct CoverRuntime { query_active: AtomicBool, image_active: AtomicUsize }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverCandidate {
    id: String, provider: String, title: String, creator: String, year: String,
    cover_url: Option<String>, source_url: String, credit: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverImage { mime_type: String, base64: String }
pub fn require_main(label: &str) -> Result<(), String> {
    if label == "main" { Ok(()) } else { Err("WINDOW_CAPABILITY_DENIED:仅主窗口可查找经历封面".into()) }
}
struct QueryLease<'a>(&'a AtomicBool);
impl Drop for QueryLease<'_> { fn drop(&mut self) { self.0.store(false, Ordering::SeqCst); } }
struct ImageLease<'a>(&'a AtomicUsize);
impl Drop for ImageLease<'_> { fn drop(&mut self) { self.0.fetch_sub(1, Ordering::SeqCst); } }

#[tauri::command]
pub async fn experience_cover_search(window: WebviewWindow, app: AppHandle, runtime: State<'_, CoverRuntime>, provider: String, category: String, query: String, creator: Option<String>) -> Result<Vec<CoverCandidate>, String> {
    require_main(window.label())?;
    let query = query.trim();
    let creator = creator.as_deref().unwrap_or("").trim();
    if creator.chars().count() > 100 { return Err("作者提示不能超过100字".into()); }
    if query.is_empty() || query.chars().count() > 160 { return Err("请输入不超过160字的作品名称".into()); }
    if !["novel","book","anime","manga","film","series","game","other"].contains(&category.as_str()) { return Err("该类别不支持找封面".into()); }
    if runtime.query_active.swap(true, Ordering::SeqCst) { return Err("上一项封面请求尚未结束，请稍候".into()); }
    let _lease = QueryLease(&runtime.query_active);
    providers::search(&http::client()?, &provider, &category, query, creator, &SecretRepository::from_app(&app)?).await
}
#[tauri::command]
pub async fn experience_cover_link(window: WebviewWindow, runtime: State<'_, CoverRuntime>, url: String) -> Result<CoverCandidate, String> {
    require_main(window.label())?;
    links::supported_link(&url)?;
    if runtime.query_active.swap(true, Ordering::SeqCst) { return Err("上一项封面请求尚未结束，请稍候".into()); }
    let _lease = QueryLease(&runtime.query_active);
    links::resolve(&http::client()?, &url).await
}
#[tauri::command]
pub async fn experience_cover_image(window: WebviewWindow, runtime: State<'_, CoverRuntime>, url: String) -> Result<CoverImage, String> {
    require_main(window.label())?;
    let url = http::image_url(&url)?;
    let previous = runtime.image_active.fetch_add(1, Ordering::SeqCst);
    let _lease = ImageLease(&runtime.image_active);
    if previous >= 4 { return Err("正在准备其他封面，请稍候再试".into()); }
    let response = http::client()?.get(url).send().await.map_err(|error| http::request_error(error, "封面图片"))?;
    let bytes = http::bytes(response, 5 * 1024 * 1024).await?;
    let mime = http::image_mime(&bytes)?;
    Ok(CoverImage { mime_type: mime.into(), base64: STANDARD.encode(bytes) })
}
