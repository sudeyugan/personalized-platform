use reqwest::Url;
use serde::Serialize;
use super::policy::public_url;

#[derive(Serialize)]
pub struct PageLink { pub text: String, pub url: String }

pub struct PageText { pub title: String, pub text: String, pub links: Vec<PageLink>, pub truncated: bool }

fn decode(raw: &str) -> String {
    let mut text = raw.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'");
    text = text.replace("&amp;", "&");
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn attribute(tag: &str, wanted: &str) -> Option<String> {
    let bytes = tag.as_bytes();
    let mut pos = tag.find(char::is_whitespace)?;
    while pos < bytes.len() {
        while pos < bytes.len() && (bytes[pos].is_ascii_whitespace() || bytes[pos] == b'/') { pos += 1; }
        let start = pos;
        while pos < bytes.len() && !bytes[pos].is_ascii_whitespace() && !matches!(bytes[pos], b'=' | b'/' | b'>') { pos += 1; }
        let key = &tag[start..pos];
        while pos < bytes.len() && bytes[pos].is_ascii_whitespace() { pos += 1; }
        if pos == bytes.len() || bytes[pos] != b'=' { if pos == start { pos += 1; } continue; }
        pos += 1;
        while pos < bytes.len() && bytes[pos].is_ascii_whitespace() { pos += 1; }
        let quote = bytes.get(pos).copied().filter(|value| *value == b'\'' || *value == b'"');
        if quote.is_some() { pos += 1; }
        let start = pos;
        while pos < bytes.len() && !quote.map_or(bytes[pos].is_ascii_whitespace(), |quote| bytes[pos] == quote) { pos += 1; }
        let value = &tag[start..pos];
        if quote.is_some() && pos < bytes.len() { pos += 1; }
        if key.eq_ignore_ascii_case(wanted) { return Some(decode(value)); }
    }
    None
}

fn tag_end(text: &str) -> Option<usize> {
    let mut quote = None;
    for (index, byte) in text.bytes().enumerate() {
        if quote == Some(byte) { quote = None; }
        else if quote.is_none() && matches!(byte, b'\'' | b'"') { quote = Some(byte); }
        else if quote.is_none() && byte == b'>' { return Some(index); }
    }
    None
}

pub fn extract(html: &str, base: &Url) -> PageText {
    // This is static-source extraction, not a DOM/visibility or JavaScript engine.
    let lower = html.to_ascii_lowercase();
    let mut pos = 0;
    let mut title = String::new();
    let mut text = String::new();
    let mut links = Vec::new();
    let mut anchor: Option<(String, usize)> = None;
    let mut in_title = false;
    while pos < html.len() {
        if lower[pos..].starts_with("<!--") {
            pos = lower[pos + 4..].find("-->").map_or(html.len(), |end| pos + 4 + end + 3); continue;
        }
        if html.as_bytes()[pos] != b'<' {
            let end = html[pos..].find('<').map_or(html.len(), |end| pos + end);
            if in_title { title.push_str(&html[pos..end]); } else { text.push_str(&html[pos..end]); }
            pos = end; continue;
        }
        let Some(end) = tag_end(&html[pos + 1..]).map(|end| pos + 1 + end) else { break; };
        let tag = &html[pos + 1..end];
        let name = tag.split_whitespace().next().unwrap_or("").trim_end_matches('/').to_ascii_lowercase();
        pos = end + 1;
        if matches!(name.as_str(), "script" | "style" | "noscript" | "template" | "svg") {
            let close = format!("</{name}");
            pos = lower[pos..].find(&close).and_then(|offset| lower[pos + offset..].find('>').map(|end| pos + offset + end + 1)).unwrap_or(html.len());
            continue;
        }
        if name == "title" { in_title = true; }
        else if name == "/title" { in_title = false; }
        else if name == "a" && links.len() < 30 {
            anchor = attribute(tag, "href").and_then(|href| base.join(&href).ok())
                .and_then(|url| public_url(url.as_str()).ok()).map(|url| (url.to_string(), text.len()));
        } else if name == "/a" {
            if let Some((url, start)) = anchor.take() {
                let label = decode(&text[start..]);
                if !label.is_empty() { links.push(PageLink { text: label.chars().take(120).collect(), url }); }
            }
        }
        if matches!(name.as_str(), "br" | "p" | "/p" | "div" | "/div" | "li" | "/li" | "h1" | "h2" | "/h1" | "/h2" | "tr" | "/tr") { text.push(' '); }
    }
    let text = decode(&text);
    PageText { title: decode(&title).chars().take(240).collect(), truncated: text.chars().count() > 12000, text: text.chars().take(12000).collect(), links }
}
