use std::{error::Error as _, time::Duration};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, WebviewWindow};
use crate::repositories::SecretRepository;

const TENCENT_ENDPOINT: &str = "https://api.wsa.cloud.tencent.com/SearchPro";
const BOCHA_ENDPOINT: &str = "https://api.bochaai.com/v1/web-search";

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WebSearchProvider { Tencent, Bocha, Bing }

impl WebSearchProvider {
    fn label(self) -> &'static str {
        match self { Self::Tencent => "tencent", Self::Bocha => "bocha", Self::Bing => "bing" }
    }
    fn secret_id(self) -> Option<&'static str> {
        match self { Self::Tencent => Some("web-search-tencent"), Self::Bocha => Some("web-search-bocha"), Self::Bing => None }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResult { title: String, snippet: String, url: String, provider: &'static str }

fn result(title: &str, snippet: &str, url: &str, provider: &'static str) -> Option<WebSearchResult> {
    let parsed = reqwest::Url::parse(url).ok()?;
    if parsed.scheme() != "https" || title.trim().is_empty() { return None; }
    Some(WebSearchResult {
        title: strip_html(title),
        snippet: strip_html(snippet).chars().take(1200).collect(),
        url: parsed.to_string(),
        provider,
    })
}

fn strip_html(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut inside = false;
    for character in value.chars() {
        match character {
            '<' => inside = true,
            '>' => inside = false,
            _ if !inside => output.push(character),
            _ => {}
        }
    }
    output.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn xml_value(item: &str, tag: &str) -> String {
    let start_tag = format!("<{tag}>");
    let end_tag = format!("</{tag}>");
    let Some(start) = item.find(&start_tag).map(|index| index + start_tag.len()) else { return String::new() };
    let Some(end) = item[start..].find(&end_tag).map(|index| start + index) else { return String::new() };
    item[start..end]
        .replace("<![CDATA[", "").replace("]]>", "")
        .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
        .replace("&quot;", &char::from(34).to_string()).replace("&#39;", "'")
        .trim().to_string()
}

fn classify_request_error(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() { return "TIMEOUT"; }
    if error.is_redirect() { return "REDIRECT"; }
    let mut details = error.to_string().to_ascii_lowercase();
    let mut source = error.source();
    while let Some(current) = source { details.push_str(&current.to_string().to_ascii_lowercase()); source = current.source(); }
    if details.contains("dns") || details.contains("name resolution") || details.contains("lookup address") { "DNS" }
    else if details.contains("certificate") || details.contains("tls") || details.contains("ssl") { "TLS" }
    else if details.contains("proxy") || details.contains("tunnel") { "PROXY" }
    else if error.is_connect() { "CONNECT" }
    else { "REQUEST" }
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10)).timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none()).user_agent("Yiyu/2.0 WebSearch")
        .build().map_err(|_| "WEB_SEARCH_CLIENT:无法建立联网搜索客户端".to_string())
}

fn parse_tencent(body: Value) -> Result<Vec<WebSearchResult>, String> {
    let response = body.get("Response").ok_or("WEB_SEARCH_RESPONSE_INVALID:tencent")?;
    if let Some(error) = response.get("Error") {
        let code = error.get("Code").and_then(Value::as_str).unwrap_or("REMOTE_ERROR");
        return Err(format!("WEB_SEARCH_PROVIDER_ERROR:tencent:{code}"));
    }
    let pages = response.get("Pages").and_then(Value::as_array).ok_or("WEB_SEARCH_RESPONSE_INVALID:tencent")?;
    Ok(pages.iter().take(10).filter_map(|page| {
        let page: Value = serde_json::from_str(page.as_str()?).ok()?;
        result(
            page.get("title")?.as_str()?,
            page.get("passage").or_else(|| page.get("content")).and_then(Value::as_str).unwrap_or(""),
            page.get("url")?.as_str()?, "tencent",
        )
    }).collect())
}

fn parse_bocha(body: Value) -> Result<Vec<WebSearchResult>, String> {
    if body.get("code").and_then(Value::as_i64).is_some_and(|code| code != 200) {
        return Err(format!("WEB_SEARCH_PROVIDER_ERROR:bocha:{}", body.get("code").and_then(Value::as_i64).unwrap_or_default()));
    }
    let values = body.pointer("/data/webPages/value").and_then(Value::as_array).ok_or("WEB_SEARCH_RESPONSE_INVALID:bocha")?;
    Ok(values.iter().take(10).filter_map(|page| result(
        page.get("name")?.as_str()?,
        page.get("summary").or_else(|| page.get("snippet")).and_then(Value::as_str).unwrap_or(""),
        page.get("url")?.as_str()?, "bocha",
    )).collect())
}

async fn fetch_key_provider(provider: WebSearchProvider, query: &str, api_key: &str) -> Result<Vec<WebSearchResult>, String> {
    let (endpoint, body) = match provider {
        WebSearchProvider::Tencent => (TENCENT_ENDPOINT, serde_json::json!({ "Query": query })),
        WebSearchProvider::Bocha => (BOCHA_ENDPOINT, serde_json::json!({ "query": query, "count": 10, "summary": true })),
        WebSearchProvider::Bing => return fetch_bing(query).await,
    };
    let response = client()?.post(endpoint)
        .header(reqwest::header::AUTHORIZATION, format!("Bearer {api_key}"))
        .header(reqwest::header::CONTENT_TYPE, "application/json; charset=UTF-8")
        .json(&body).send().await
        .map_err(|error| format!("WEB_SEARCH_REQUEST:{}:{}", provider.label(), classify_request_error(&error)))?;
    if !response.status().is_success() { return Err(format!("WEB_SEARCH_HTTP:{}:{}", provider.label(), response.status().as_u16())); }
    let body = response.json::<Value>().await.map_err(|_| format!("WEB_SEARCH_RESPONSE_INVALID:{}", provider.label()))?;
    let results = match provider {
        WebSearchProvider::Tencent => parse_tencent(body)?,
        WebSearchProvider::Bocha => parse_bocha(body)?,
        WebSearchProvider::Bing => unreachable!(),
    };
    if results.is_empty() { Err(format!("WEB_SEARCH_EMPTY:{}", provider.label())) } else { Ok(results) }
}

fn is_allowed_bing_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https" && matches!(url.host_str(), Some("www.bing.com" | "cn.bing.com"))
}

fn parse_bing(body: &str) -> Vec<WebSearchResult> {
    body.split("<item>").skip(1).take(6).filter_map(|item| result(
        &xml_value(item, "title"), &xml_value(item, "description"), &xml_value(item, "link"), "bing-fallback",
    )).collect()
}

async fn fetch_bing(query: &str) -> Result<Vec<WebSearchResult>, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10)).timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 3 || !is_allowed_bing_url(attempt.url()) { attempt.stop() } else { attempt.follow() }
        }))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Yiyu/2.0")
        .build().map_err(|_| "WEB_SEARCH_CLIENT:无法建立应急搜索客户端".to_string())?;
    let mut failures = Vec::new();
    for (label, endpoint) in [("www", "https://www.bing.com/search"), ("cn", "https://cn.bing.com/search")] {
        let response = match client.get(endpoint)
            .header(reqwest::header::ACCEPT, "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8")
            .header(reqwest::header::ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
            .query(&[("format", "rss"), ("setlang", "zh-hans"), ("q", query)]).send().await {
                Ok(response) => response,
                Err(error) => { failures.push(format!("{label}:{}", classify_request_error(&error))); continue; }
            };
        if !is_allowed_bing_url(response.url()) { failures.push(format!("{label}:REDIRECT_DENIED")); continue; }
        if !response.status().is_success() { failures.push(format!("{label}:HTTP_{}", response.status().as_u16())); continue; }
        let body = match response.text().await { Ok(body) => body, Err(_) => { failures.push(format!("{label}:BODY")); continue; } };
        let results = parse_bing(&body);
        if !results.is_empty() { return Ok(results); }
        failures.push(format!("{label}:EMPTY_RSS"));
    }
    Err(format!("WEB_SEARCH_UNAVAILABLE:{}", failures.join(" | ")))
}

#[tauri::command]
pub async fn web_search(window: WebviewWindow, app: AppHandle, query: String, provider: WebSearchProvider, fallback_to_bing: bool) -> Result<Vec<WebSearchResult>, String> {
    if window.label() != "main" { return Err("WINDOW_CAPABILITY_DENIED:桌面伙伴不能调用联网搜索".into()); }
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 200 { return Err("WEB_SEARCH_QUERY_INVALID:查询词不能为空且不能超过 200 字".into()); }
    if let Some(secret_id) = provider.secret_id() {
        let key = SecretRepository::from_app(&app)?.load(secret_id)?;
        if let Some(key) = key.filter(|value| !value.trim().is_empty()) {
            match fetch_key_provider(provider, query, &key).await {
                Ok(results) => return Ok(results),
                Err(error) if !fallback_to_bing => return Err(error),
                Err(_) => {}
            }
        } else if !fallback_to_bing { return Err(format!("WEB_SEARCH_KEY_MISSING:{}", provider.label())); }
    } else { return fetch_bing(query).await; }
    fetch_bing(query).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_provider_responses_into_one_shape() {
        let tencent = serde_json::json!({ "Response": { "Pages": [r#"{"title":"标题","passage":"<b>摘要</b>","url":"https://example.com/a"}"#] } });
        let bocha = serde_json::json!({ "code": 200, "data": { "webPages": { "value": [{ "name": "标题", "summary": "摘要", "url": "https://example.com/b" }] } } });
        assert_eq!(parse_tencent(tencent).unwrap()[0].provider, "tencent");
        assert_eq!(parse_bocha(bocha).unwrap()[0].provider, "bocha");
    }

    #[test]
    fn rejects_non_https_result_urls() {
        assert!(result("标题", "摘要", "http://example.com", "test").is_none());
        assert!(result("标题", "摘要", "javascript:alert(1)", "test").is_none());
    }

    #[test]
    fn search_error_codes_do_not_contain_request_urls() {
        let error = tauri::async_runtime::block_on(async {
            reqwest::Client::builder().timeout(Duration::ZERO).build().unwrap()
                .get("https://www.bing.com/search?q=private").send().await
        }).unwrap_err();
        assert_eq!(classify_request_error(&error), "TIMEOUT");
    }
}
