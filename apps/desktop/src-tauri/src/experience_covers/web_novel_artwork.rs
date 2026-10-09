use super::{CoverCandidate, http, links};

// This public Qidian image route is keyed by the already verified official work ID.
// No browser verification, account, arbitrary search-image URL or chapter request is involved.
pub(super) fn qidian_cover(source: &str) -> Option<String> {
    let (provider, canonical) = links::supported_link(source).ok()?;
    let url = reqwest::Url::parse(&canonical).ok()?;
    if provider != "webnovel" || url.host_str() != Some("www.qidian.com") { return None; }
    let id = url.path().trim_matches('/').strip_prefix("book/")?;
    http::image_url(&format!("https://qidian.qpic.cn/qdbimg/349573/{id}/180")).ok().map(|url| url.to_string())
}

// Only the public work page's cover element, not arbitrary images, scripts or chapter pages.
pub(super) fn attribute<'a>(tag: &'a str, key: &str) -> Option<&'a str> {
    for (index, _) in tag.match_indices(key) {
        if index == 0 || !tag.as_bytes()[index - 1].is_ascii_whitespace() { continue; }
        let Some(rest) = tag[index + key.len()..].trim_start().strip_prefix('=') else { continue };
        let rest = rest.trim_start();
        let quote = rest.chars().next()?;
        if !matches!(quote, '\'' | '"') { continue; }
        let value = &rest[quote.len_utf8()..];
        return value.find(quote).map(|end| &value[..end]);
    }
    None
}
pub(super) fn jinjiang_cover(html: &str) -> Option<String> {
    for (_, rest) in html.match_indices("<img").map(|(index, _)| (index, &html[index..])) {
        let Some(end) = rest.find('>') else { continue };
        let tag = &rest[..end];
        if !attribute(tag, "class").is_some_and(|classes| classes.split_ascii_whitespace().any(|class| class == "noveldefaultimage")) { continue; }
        let url = http::image_url(attribute(tag, "src")?).ok()?;
        if url.host_str().is_some_and(|host| host.ends_with("-static.jjwxc.net")) { return Some(url.to_string()); }
    }
    None
}

pub(super) async fn enrich(mut candidate: CoverCandidate) -> CoverCandidate {
    if super::novel_catalogue::platform(&candidate.source_url).is_some_and(|(_, id, _)| matches!(id, "zongheng" | "qimao")) {
        if let Ok(client) = http::client() {
            if let Ok(mut page) = super::novel_metadata::detail(&client, &candidate.source_url).await {
                if page.title == candidate.title { page.matched_title = candidate.matched_title; }
                return page;
            }
        }
        return candidate;
    }
    if let Some(url) = qidian_cover(&candidate.source_url) {
        candidate.cover_url = Some(url);
        candidate.credit.push_str("；封面：起点官方书封图片");
        return candidate;
    }
    if links::supported_link(&candidate.source_url).ok().is_some_and(|(provider, _)| provider == "fanqie") {
        if let Ok(client) = http::client() {
            if let Ok(page) = links::fanqie_detail(&client, &candidate.source_url).await {
                if candidate.title != page.title { candidate.matched_title = None; }
                candidate.title = page.title;
                candidate.creator = page.creator;
                candidate.source_url = page.source_url;
                candidate.id = format!("fanqie:{}", candidate.source_url);
                candidate.cover_url = page.cover_url;
                candidate.credit = page.credit;
            }
        }
    }
    if links::supported_link(&candidate.source_url).ok().is_some_and(|(_, canonical)| canonical.starts_with("https://www.jjwxc.net/onebook.php?novelid=")) {
        if let Ok(client) = http::client() {
            if let Ok(response) = client.get(&candidate.source_url).send().await {
                if let Ok(raw) = http::bytes(response, 2 * 1024 * 1024).await {
                    // ASCII attributes work for the site's GBK pages without changing title metadata.
                    if let Some(url) = jinjiang_cover(&String::from_utf8_lossy(&raw)) {
                        candidate.cover_url = Some(url);
                        candidate.credit.push_str("；封面：晋江官方公开作品页");
                    }
                }
            }
        }
    }
    candidate
}

pub(super) async fn enrich_candidates(candidates: Vec<CoverCandidate>) -> Vec<CoverCandidate> {
    let tasks: Vec<_> = candidates.into_iter().map(|candidate| tauri::async_runtime::spawn(enrich(candidate))).collect();
    let mut results: Vec<CoverCandidate> = Vec::new();
    for task in tasks {
        if let Ok(candidate) = task.await {
            if let Some(previous) = results.iter_mut().find(|previous| previous.source_url == candidate.source_url) {
                if previous.cover_url.is_none() && candidate.cover_url.is_some() { *previous = candidate; }
            } else { results.push(candidate); }
        }
    }
    results
}
