use super::{CoverCandidate, http, providers, web_novels};
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;

pub fn supported_link(value: &str) -> Result<(String, String), String> {
    let url = http::https_url(value)?;
    if let Some(canonical) = super::novel_catalogue::additional_link(value) { return Ok(("webnovel".into(), canonical)); }
    let host = url.host_str().unwrap_or_default();
    let path: Vec<_> = url.path().trim_matches('/').split('/').collect();
    if url.query().is_none() && path.len() == 2 && !path[1].is_empty() && path[1].chars().all(|c| c.is_ascii_digit()) {
        return match (host, path[0]) {
            ("fanqienovel.com" | "www.fanqienovel.com", "page" | "keyword") => Ok(("fanqie".into(), format!("https://fanqienovel.com/{}/{}", path[0], path[1]))),
            ("www.qidian.com" | "qidian.com", "book") => Ok(("webnovel".into(), format!("https://www.qidian.com/book/{}/", path[1]))),
            ("book.qidian.com", "info") | ("m.qidian.com", "book") => Ok(("webnovel".into(), format!("https://www.qidian.com/book/{}/", path[1]))),
            ("bgm.tv" | "bangumi.tv" | "chii.in", "subject") => Ok(("bangumi".into(), path[1].into())),
            _ => Err("目前支持起点、番茄、晋江、纵横、七猫、17K公开作品页和Bangumi条目链接".into()),
        };
    }
    if matches!(host, "www.jjwxc.net" | "jjwxc.net") && path.len() == 1 && path[0] == "onebook.php" {
        let pairs: Vec<_> = url.query_pairs().collect();
        if pairs.len() == 1 {
            let (key, value) = &pairs[0];
            if key == "novelid" && !value.is_empty() && value.chars().all(|c| c.is_ascii_digit()) {
                return Ok(("webnovel".into(), format!("https://www.jjwxc.net/onebook.php?novelid={value}")));
            }
        }
    }
    Err("请粘贴起点、番茄、晋江、纵横、七猫、17K或Bangumi的完整官方作品链接（不带分享追踪参数）".into())
}
pub async fn resolve(client: &Client, value: &str, search: crate::web_search::PreparedSearch) -> Result<CoverCandidate, String> {
    let (provider, target) = supported_link(value)?;
    if provider == "bangumi" { return providers::bangumi_detail(client, &target).await; }
    if provider == "webnovel" {
        if super::novel_catalogue::platform(&target).is_some_and(|(_, id, _)| matches!(id, "zongheng" | "qimao")) {
            return super::novel_metadata::detail(client, &target).await;
        }
        return web_novels::search_using(&target, "", search).await?.into_iter().find(|item| item.source_url == target)
            .ok_or("公开目录未识别到这个作品链接；可改用书名搜索".into());
    }
    fanqie_detail(client, &target).await
}
pub(super) async fn fanqie_detail(client: &Client, value: &str) -> Result<CoverCandidate, String> {
    let (provider, target) = supported_link(value)?;
    if provider != "fanqie" { return Err("请使用番茄官方作品链接".into()); }
    let response = client.get(&target).send().await.map_err(|error| http::request_error(error, "番茄作品页"))?;
    let raw = http::bytes(response, 2 * 1024 * 1024).await?;
    let html = String::from_utf8(raw).map_err(|_| "作品页不是支持的UTF-8格式")?;
    if reqwest::Url::parse(&target).is_ok_and(|url| url.path().starts_with("/keyword/")) {
        let work = parse_fanqie_keyword(&html)?;
        // Only the explicit main work, once. Never follow recommendations or chapter links.
        let response = client.get(&work).send().await.map_err(|error| http::request_error(error, "番茄作品页"))?;
        let raw = http::bytes(response, 2 * 1024 * 1024).await?;
        let html = String::from_utf8(raw).map_err(|_| "作品页不是支持的UTF-8格式")?;
        return parse_fanqie(&html, &work);
    }
    parse_fanqie(&html, &target)
}
pub(super) fn parse_fanqie_keyword(html: &str) -> Result<String, String> {
    let marker = "window._SSR_DATA = ";
    let start = html.find(marker).ok_or("聚合页未提供明确作品信息，请使用官方作品页链接")?;
    let mut decoder = serde_json::Deserializer::from_str(&html[start + marker.len()..]);
    let data = Value::deserialize(&mut decoder).map_err(|_| "聚合页格式已变化，请使用官方作品页链接")?;
    let loaders = data["data"]["loadersData"].as_object().ok_or("未识别聚合页主作品")?;
    let mut works = loaders.values().filter_map(|loader| loader["data"]["main_novel"]["book_detail_page_url"].as_str());
    let mut url = http::https_url(works.next().ok_or("聚合页未提供主作品链接")?)?;
    if works.next().is_some() { return Err("聚合页包含多部主作品，请使用具体作品页链接".into()); }
    if url.query().is_some() && url.query() != Some("source=seo_fq_juhe") { return Err("聚合页作品链接参数不受支持".into()); }
    url.set_query(None);
    let (provider, work) = supported_link(url.as_str())?;
    if provider != "fanqie" || !work.starts_with("https://fanqienovel.com/page/") { return Err("聚合页未指向番茄官方作品页".into()); }
    Ok(work)
}
pub fn parse_fanqie(html: &str, source_url: &str) -> Result<CoverCandidate, String> {
    let (provider, source_url) = supported_link(source_url)?;
    if provider != "fanqie" || !source_url.starts_with("https://fanqienovel.com/page/") { return Err("请使用番茄具体作品页".into()); }
    let start = html.find("window.__INITIAL_STATE__=").ok_or("作品页未提供公开信息，可能需登录或验证；未尝试绕过限制")?;
    let raw = &html[start + "window.__INITIAL_STATE__=".len()..];
    // Parse a JSON value only. Never eval the script or fetch chapter contents.
    let mut decoder = serde_json::Deserializer::from_str(raw);
    let data = Value::deserialize(&mut decoder).map_err(|_| "作品页格式已变化，可先使用文字封面")?;
    let page = &data["page"];
    let id = page["bookId"].as_str().ok_or("作品页未提供作品ID")?;
    if source_url.rsplit('/').next() != Some(id) { return Err("作品ID与官方链接不一致，请核对作品页".into()); }
    let title = page["bookName"].as_str().filter(|s| !s.trim().is_empty()).ok_or("未识别到作品名称")?;
    let cover = ["thumbUrl", "thumbUri"].iter().find_map(|field| page[field].as_str().and_then(|s|http::image_url(s).ok())).map(|u|u.to_string());
    Ok(CoverCandidate { id: id.into(), provider: "fanqie".into(),
        title: title.chars().take(160).collect(), creator: page["author"].as_str().unwrap_or("").chars().take(100).collect(),
        year: String::new(), cover_url: cover, source_url, matched_title: None, credit: "作品信息与封面：番茄小说官方作品页".into() })
}
