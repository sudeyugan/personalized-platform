use super::{CoverCandidate, http, links, novel_matching, novel_metadata, web_novel_artwork::attribute};
use crate::web_search::WebSearchResult;

fn catalogue_clue(value: &str) -> Option<String> {
    let url = http::https_url(value).ok()?;
    let parts: Vec<_> = url.path().trim_matches('/').split('/').collect();
    if url.host_str() != Some("www.zongheng.com") || url.query().is_some() || parts.len() != 2 || parts[0] != "baike" || parts[1].is_empty() || !parts[1].chars().all(|c| c.is_ascii_digit()) { return None; }
    Some(url.to_string())
}
pub(super) fn work_reference(html: &str, title: &str) -> Result<String, String> {
    let mut works = std::collections::HashSet::new();
    // Only named references in the official encyclopedia, not the article itself,
    // recommendations, Nuxt code, chapters, third-party references or author pages.
    for (_, rest) in html.match_indices("<p").map(|(index, _)| (index, &html[index..])) {
        let Some((tag, tail)) = rest.split_once('>') else { continue };
        if !attribute(tag, "class").is_some_and(|value| value.split_ascii_whitespace().any(|class| class == "reference-cell-link")) { continue; }
        let Some((reference, _)) = tail.split_once("</p>") else { continue };
        let Some((_, anchor)) = reference.split_once("<a ") else { continue };
        let Some((attrs, text)) = anchor.split_once('>') else { continue };
        let Some((name, _)) = text.split_once("</a>") else { continue };
        if novel_matching::normalized(name) != novel_matching::normalized(title) { continue; }
        let tag = format!("<a {attrs}");
        let Some(value) = attribute(&tag, "href") else { continue };
        // Old HTTP references may be mapped locally to HTTPS only after the same
        // credentials/port/query/path checks; HTTP is never requested or followed.
        let secure = if let Some(path) = value.strip_prefix("http://book.zongheng.com/book/") { format!("https://book.zongheng.com/book/{path}") } else { value.into() };
        let Ok((_, canonical)) = links::supported_link(&secure) else { continue };
        if canonical.starts_with("https://www.zongheng.com/detail/") { works.insert(canonical); }
    }
    if works.len() != 1 { return Err("官方百科没有唯一明确的同名作品引用".into()); }
    Ok(works.into_iter().next().unwrap())
}
pub(super) async fn resolve(items: &[WebSearchResult], title: &str) -> Vec<CoverCandidate> {
    let mut urls = Vec::new();
    for item in items {
        if let Some(url) = catalogue_clue(&item.url) {
            if !urls.contains(&url) { urls.push(url); }
            if urls.len() == 2 { break; }
        }
    }
    let tasks: Vec<_> = urls.into_iter().map(|url| {
        let title = title.to_string();
        tauri::async_runtime::spawn(async move {
            let client = http::client().ok()?;
            let response = client.get(&url).send().await.ok()?;
            let html = String::from_utf8(http::bytes(response, 2 * 1024 * 1024).await.ok()?).ok()?;
            let source = work_reference(&html, &title).ok()?;
            let found = novel_metadata::detail(&client, &source).await.ok()?;
            (novel_matching::normalized(&found.title) == novel_matching::normalized(&title)).then_some(found)
        })
    }).collect();
    let mut found = Vec::new();
    for task in tasks { if let Ok(Some(item)) = task.await { found.push(item); } }
    found
}
