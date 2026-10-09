use super::{CoverCandidate, http, links, novel_catalogue, web_novel_artwork::attribute};
use reqwest::Client;

fn text(value: &str) -> String {
    value.replace("&quot;", "\"").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").split_whitespace().collect::<Vec<_>>().join(" ")
}
fn meta(head: &str, key: &str) -> Option<String> {
    head.split("<meta").skip(1).filter_map(|part| part.split_once('>').map(|(tag, _)| tag)).find_map(|tag| {
        let tag = format!("<meta{tag}");
        if attribute(&tag, "name").or_else(|| attribute(&tag, "property")) != Some(key) { return None; }
        attribute(&tag, "content").map(text)
    })
}
fn tag_content<'a>(html: &'a str, tag: &str, class: &str) -> Option<&'a str> {
    let open = format!("<{tag}");
    html.match_indices(&open).find_map(|(index, _)| {
        let part = &html[index + open.len()..];
        let (attrs, tail) = part.split_once('>')?;
        let attrs = format!("<{tag}{attrs}");
        if !attribute(&attrs, "class").is_some_and(|v| v.split_ascii_whitespace().any(|c| c == class)) { return None; }
        Some(tail)
    })
}
pub(super) fn parse(html: &str, source: &str) -> Result<CoverCandidate, String> {
    let (_, source_url) = links::supported_link(source)?;
    let (label, platform, _) = novel_catalogue::platform(&source_url).ok_or("未支持的作品来源")?;
    let (title, creator, cover) = match platform {
        "zongheng" => {
            let head = html.split("</head>").next().unwrap_or(html);
            let read = meta(head, "og:novel:read_url").ok_or("公开页未提供作品地址")?;
            let read = if read.starts_with("//") { format!("https:{read}") } else { read };
            if links::supported_link(&read)?.1 != source_url { return Err("作品页地址不一致，请核对".into()); }
            (meta(head, "og:novel:book_name"), meta(head, "og:novel:author"), meta(head, "og:image"))
        }
        "qimao" => {
            // Only the work header, never recommendations, sample chapters or Nuxt scripts.
            let info = tag_content(html, "div", "book-information").ok_or("未识别公开作品信息")?;
            let mut end = info.find("<div class=\"update-info\"").unwrap_or(info.len()).min(12_000);
            while !info.is_char_boundary(end) { end -= 1; }
            let update = tag_content(info, "span", "update-chapter-title").and_then(|tail| tail.split_once("</span>").map(|(link, _)| link))
                .and_then(|link| link.split_once("<a ").map(|(_, attrs)| attrs)).and_then(|attrs| attrs.split_once('>').map(|(attrs, _)| format!("<a {attrs}")))
                .and_then(|tag| attribute(&tag, "href").map(str::to_string)).and_then(|href| http::https_url(&href).ok());
            let id = source_url.trim_end_matches('/').rsplit('/').next().unwrap_or_default();
            let prefix = format!("/shuku/{id}-");
            if !update.is_some_and(|url| url.host_str() == Some("www.qimao.com") && url.query().is_none()
                && url.path().strip_prefix(&prefix).is_some_and(|suffix| !suffix.trim_matches('/').is_empty() && suffix.trim_matches('/').chars().all(|c| c.is_ascii_digit()))) { return Err("作品ID与官方页头部不一致".into()); }
            // The header's update link is only an ID cross-check; never request it.
            let info = &info[..end];
            let title_block = tag_content(info, "div", "title").ok_or("未识别作品名")?;
            let title = tag_content(title_block, "span", "txt").and_then(|tail| tail.split_once("</span>").map(|(name, _)| text(name)));
            if !title.as_ref().is_some_and(|name| !name.is_empty() && html.split("</title>").next().is_some_and(|head| head.contains(&format!("<title>{name}免费阅读")))) { return Err("作品名与公开页不一致".into()); }
            let creator = info.split("<a ").skip(1).find_map(|part| {
                let (attrs, tail) = part.split_once('>')?;
                let tag = format!("<a {attrs}");
                if !attribute(&tag, "href").is_some_and(|href| href.starts_with("https://www.qimao.com/zuozhe/")) { return None; }
                tail.split_once("</a>").map(|(name, _)| text(name))
            });
            let cover = tag_content(info, "div", "wrap-pic").and_then(|tail| tail.split_once("</div>").map(|(pic, _)| pic))
                .and_then(|pic| pic.split_once("<img").map(|(_, tail)| tail)).and_then(|tail| tail.split_once('>').map(|(attrs, _)| format!("<img{attrs}")))
                .and_then(|tag| attribute(&tag, "src").map(text));
            (title, creator, cover)
        }
        _ => return Err("此来源仅支持公开目录元数据，不抓取验证页".into()),
    };
    let title = title.filter(|name| !name.trim().is_empty() && !name.contains(['<', '>'])).ok_or("未识别作品名称，请核对官方作品页")?;
    let cover_url = cover.and_then(|image| http::image_url(&image).ok()).filter(|url| match platform {
        "zongheng" => url.host_str() == Some("static.zongheng.com"),
        "qimao" => url.host_str() == Some("cdn.wtzw.com"),
        _ => false,
    }).map(|url| url.to_string());
    Ok(CoverCandidate { id: format!("{platform}:{source_url}"), provider: "webnovel".into(), title: title.chars().take(160).collect(),
        creator: creator.unwrap_or_default().chars().take(100).collect(), year: String::new(), cover_url, source_url, matched_title: None,
        credit: format!("作品信息与可用封面：{label}官方公开作品页") })
}
pub(super) async fn detail(client: &Client, source: &str) -> Result<CoverCandidate, String> {
    let (_, canonical) = links::supported_link(source)?;
    if !novel_catalogue::platform(&canonical).is_some_and(|(_, id, _)| matches!(id, "zongheng" | "qimao")) { return Err("未支持的公开作品页".into()); }
    let response = client.get(&canonical).send().await.map_err(|error| http::request_error(error, "官方作品页"))?;
    let raw = http::bytes(response, 2 * 1024 * 1024).await?;
    let html = String::from_utf8(raw).map_err(|_| "作品页不是UTF-8格式")?;
    parse(&html, &canonical)
}
