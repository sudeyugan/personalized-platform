use super::{CoverCandidate, http, links, novel_catalogue, novel_matching};
use crate::web_search::{PreparedSearch, WebSearchResult};

pub(super) fn source(value: &str) -> Option<(&'static str, &'static str)> {
    let (_, canonical) = links::supported_link(value).ok()?;
    let (label, platform, _) = novel_catalogue::platform(&canonical)?;
    Some((label, platform))
}

pub(super) fn clean_title(value: &str) -> (String, String) {
    let mut end = value.len();
    for marker in ["小说在线阅读", "完整版在线免费阅读", "最新章节", "全文阅读", "-首发起点中文网", "_起点中文网", "-番茄小说", "_番茄小说", "_晋江文学城", "-晋江文学城", "免费阅读", "-纵横中文网", "-17K小说网", "-17k小说网", "_17K小说网", "_七猫中文网"] {
        if let Some(index) = value.find(marker) { end = end.min(index); }
    }
    let clean = value[..end].trim();
    if clean.starts_with('《') {
        if let Some((title, rest)) = clean['《'.len_utf8()..].split_once('》') {
            return (title.trim().chars().take(160).collect(), rest.trim().trim_end_matches('著').trim().chars().take(100).collect());
        }
    }
    if value.contains("17K小说网") || value.contains("17k小说网") {
        let parts: Vec<_> = clean.split('_').collect();
        if parts.len() >= 2 { return (parts[0].trim().chars().take(160).collect(), parts[1].trim().chars().take(100).collect()); }
    }
    if let Some(open) = clean.rfind(|character| character == '（' || character == '(') {
        let ascii_open = clean[open..].starts_with('(');
        let close = if ascii_open { ')' } else { '）' };
        if clean.ends_with(close) {
            let creator_start = open + if ascii_open { '('.len_utf8() } else { '（'.len_utf8() };
            let author = clean[creator_start..clean.len() - close.len_utf8()].trim();
            if !["主演", "电视剧", "电影", "动画", "动漫", "漫画", "有声", "广播剧", "精校", "修订", "全本"].iter().any(|marker| author.contains(marker)) {
                return (clean[..open].trim_matches(|character| matches!(character, '《' | '》' | ' ')).to_string(), author.to_string());
            }
        }
    }
    (clean.trim_matches(|character| matches!(character, '《' | '》' | ' ' | '-' | '_')).chars().take(160).collect(), String::new())
}

pub(super) fn queries(query: &str) -> Vec<String> {
    if let Ok((provider, target)) = links::supported_link(query) {
        if provider == "webnovel" {
            if let Ok(url) = reqwest::Url::parse(&target) {
                let id = if url.host_str() == Some("www.qidian.com") {
                    url.path().trim_matches('/').strip_prefix("book/").unwrap_or_default().to_string()
                } else if url.host_str() == Some("www.jjwxc.net") { url.query_pairs().find(|(key, _)| key == "novelid").map(|(_, id)| id.into_owned()).unwrap_or_default() }
                else { url.path().trim_matches('/').rsplit('/').next().unwrap_or_default().trim_end_matches(".html").into() };
                return vec![format!("{id} site:{}", url.host_str().unwrap_or_default())];
            }
        }
    }
    novel_catalogue::SITES.iter().map(|site| format!("{} site:{site}", query.trim())).collect()
}

// A catalogue snippet is untrusted text, never an instruction or a work candidate.
// Follow only an explicit old-title -> new-title statement from an official source.
pub(super) fn alias_queries(query: &str, items: &[WebSearchResult]) -> Vec<String> {
    let title = query.trim().trim_matches(|character| matches!(character, '《' | '》'));
    let quoted = format!("《{title}》");
    let mut aliases = Vec::new();
    for item in items {
        let Some((_, _, site)) = novel_catalogue::platform(&item.url) else { continue };
        let text: String = item.snippet.split_whitespace().collect();
        for (_, after) in text.match_indices(&quoted).map(|(index, _)| (index, &text[index + quoted.len()..])) {
            let sentence = after.split(['。', '｡', '\n', '！', '？']).next().unwrap_or_default();
            let Some(open) = sentence.find('《') else { continue };
            let prefix = &sentence[..open];
            if prefix.chars().count() > 60 || !["更名为", "改名为", "现名", "现名为"].iter().any(|marker| prefix.ends_with(marker)) { continue; }
            let Some(close) = sentence[open + '《'.len_utf8()..].find('》') else { continue };
            let alias = &sentence[open + '《'.len_utf8()..open + '《'.len_utf8() + close];
            if alias == title || alias.is_empty() || alias.chars().count() > 80 || alias.contains(['/', ':', '\n', '\r', '《']) { continue; }
            let search = format!("{alias} site:{site}");
            if !aliases.contains(&search) { aliases.push(search); }
            if aliases.len() == 2 { return aliases; }
        }
    }
    aliases
}

async fn fetch_queries(queries: Vec<String>, provider: &PreparedSearch) -> (bool, Vec<WebSearchResult>) {
    let searches: Vec<_> = queries.into_iter().map(|query| {
        let provider = provider.clone();
        tauri::async_runtime::spawn(async move { provider.fetch(&query).await })
    }).collect();
    let mut available = false;
    let mut results = Vec::new();
    for search in searches {
        if let Ok(Ok(items)) = search.await { available = true; results.extend(items); }
    }
    (available, results)
}

pub(super) fn candidates(items: Vec<WebSearchResult>, _creator: &str) -> Vec<CoverCandidate> {
    let mut candidates: Vec<CoverCandidate> = Vec::new();
    for item in items {
        let Some((label, provider)) = source(&item.url) else { continue };
        let Ok((_, source_url)) = links::supported_link(&item.url) else { continue };
        if candidates.iter().any(|candidate| candidate.source_url == source_url) { continue; }
        let (title, author) = clean_title(&item.title);
        if title.is_empty() { continue; }
        candidates.push(CoverCandidate { id: format!("{provider}:{source_url}"), provider: "webnovel".into(), title,
            creator: author, year: String::new(), cover_url: None,
            source_url, matched_title: None, credit: format!("作品信息：{label}公开作品页（由配置的搜索服务检索）") });
        if candidates.len() == 60 { break; }
    }
    candidates
}

pub(super) fn mark_aliases(candidates: &mut [CoverCandidate], query: &str, aliases: &[String]) {
    for candidate in candidates {
        let Some((_, _, site)) = novel_catalogue::platform(&candidate.source_url) else { continue };
        if aliases.iter().any(|alias| alias == &format!("{} site:{site}", candidate.title)) {
            candidate.matched_title = Some(query.trim().into());
        }
    }
}

pub(super) async fn search(query: &str, creator: &str) -> Result<Vec<CoverCandidate>, String> {
    search_using(query, creator, PreparedSearch::bing()).await
}
pub(super) async fn search_using(query: &str, creator: &str, provider: PreparedSearch) -> Result<Vec<CoverCandidate>, String> {
    if query.starts_with("https:") || query.starts_with("http:") {
        let (kind, target) = links::supported_link(query)?;
        if kind == "fanqie" { return Ok(vec![links::fanqie_detail(&http::client()?, &target).await?]); }
        if novel_catalogue::platform(&target).is_some_and(|(_, id, _)| matches!(id, "zongheng" | "qimao")) {
            return Ok(vec![super::novel_metadata::detail(&http::client()?, &target).await?]);
        }
    }
    let is_link = links::supported_link(query).is_ok();
    let (title, author) = if is_link { (links::supported_link(query)?.1, creator.into()) } else { novel_matching::input(query, creator) };
    if title.trim().is_empty() { return Err("请输入作品名称；作者可填在作者提示中".into()); }
    let mut requested = queries(&title);
    if !is_link && !author.is_empty() { requested.push(format!("{title} {author} 小说")); }
    let (available, mut results) = fetch_queries(requested, &provider).await;
    if !available { return Err("公开网文目录暂不可用；请检查联网搜索的密钥、来源或后备设置".into()); }
    let aliases = alias_queries(&title, &results);
    if !aliases.is_empty() {
        let (_, mut renamed) = fetch_queries(aliases.clone(), &provider).await;
        renamed.append(&mut results);
        results = renamed;
    }
    let mut referenced = if is_link { Vec::new() } else { super::novel_clues::resolve(&results, &title).await };
    let mut candidates = candidates(results, &author);
    mark_aliases(&mut candidates, &title, &aliases);
    if !is_link { novel_matching::rank(&mut candidates, &title, &author); }
    candidates.truncate(10);
    let mut candidates = super::web_novel_artwork::enrich_candidates(candidates).await;
    referenced.append(&mut candidates);
    let mut candidates = referenced;
    if !is_link && !candidates.iter().any(|item| novel_matching::score(item, &title, "") >= 80) {
        // A site's search hint is not a security boundary. A bounded broad recall can
        // find an official work missed by site-scoped indexes; URL guards still apply.
        let recall = vec![format!("\"{title}\" 小说"), format!("{title} {}", if author.is_empty() { "小说官方作品" } else { &author })];
        let (_, results) = fetch_queries(recall, &provider).await;
        let mut extra = self::candidates(results, &author);
        extra.retain(|item| !candidates.iter().any(|known| known.source_url == item.source_url));
        novel_matching::rank(&mut extra, &title, &author);
        extra.truncate(4);
        candidates.extend(super::web_novel_artwork::enrich_candidates(extra).await);
    }
    let mut candidates = if is_link { candidates.into_iter().filter(|item| item.source_url == title).collect() } else { novel_matching::finish(candidates, &title, &author) };
    candidates.truncate(6);
    if candidates.is_empty() { return Err("起点、番茄、晋江、纵横、七猫和17K公开目录未找到匹配作品；可补充作者或粘贴官方作品页。短名、错字与未收录作品不保证命中".into()); }
    Ok(candidates)
}
