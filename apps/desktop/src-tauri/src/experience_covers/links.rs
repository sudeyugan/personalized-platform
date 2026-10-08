use super::{CoverCandidate, http, providers};
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;

pub fn supported_link(value: &str) -> Result<(String, String), String> {
    let url = http::https_url(value)?;
    let host = url.host_str().unwrap_or_default();
    let path: Vec<_> = url.path().trim_matches('/').split('/').collect();
    if path.len() != 2 || path[1].is_empty() || !path[1].chars().all(|c| c.is_ascii_digit()) || url.query().is_some() {
        return Err("请粘贴完整作品详情链接（不带分享追踪参数）".into());
    }
    match (host, path[0]) {
        ("fanqienovel.com", "page") => Ok(("fanqie".into(), format!("https://fanqienovel.com/page/{}", path[1]))),
        ("bgm.tv" | "bangumi.tv" | "chii.in", "subject") => Ok(("bangumi".into(), path[1].into())),
        _ => Err("目前支持番茄公开作品页和Bangumi条目链接；其他平台请先用书名搜索或文字封面".into()),
    }
}
pub async fn resolve(client: &Client, value: &str) -> Result<CoverCandidate, String> {
    let (provider, target) = supported_link(value)?;
    if provider == "bangumi" { return providers::bangumi_detail(client, &target).await; }
    let response = client.get(&target).send().await.map_err(|error| http::request_error(error, "番茄作品页"))?;
    let raw = http::bytes(response, 2 * 1024 * 1024).await?;
    let html = String::from_utf8(raw).map_err(|_| "作品页不是支持的UTF-8格式")?;
    parse_fanqie(&html, &target)
}
pub fn parse_fanqie(html: &str, source_url: &str) -> Result<CoverCandidate, String> {
    let start = html.find("window.__INITIAL_STATE__=").ok_or("作品页未提供公开信息，可能需登录或验证；未尝试绕过限制")?;
    let raw = &html[start + "window.__INITIAL_STATE__=".len()..];
    // Parse a JSON value only. Never eval the script or fetch chapter contents.
    let mut decoder = serde_json::Deserializer::from_str(raw);
    let data = Value::deserialize(&mut decoder).map_err(|_| "作品页格式已变化，可先使用文字封面")?;
    let page = &data["page"];
    let title = page["bookName"].as_str().filter(|s| !s.trim().is_empty()).ok_or("未识别到作品名称")?;
    let cover = page["thumbUrl"].as_str().and_then(|s|http::image_url(s).ok()).map(|u|u.to_string());
    Ok(CoverCandidate { id: page["bookId"].as_str().unwrap_or("").into(), provider: "fanqie".into(),
        title: title.chars().take(160).collect(), creator: page["author"].as_str().unwrap_or("").chars().take(100).collect(),
        year: String::new(), cover_url: cover, source_url: source_url.into(), credit: "作品信息与封面：番茄小说官方作品页".into() })
}
