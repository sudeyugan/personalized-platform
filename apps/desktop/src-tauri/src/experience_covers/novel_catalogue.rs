use super::http;

pub(super) const SITES: [&str; 6] = ["qidian.com", "fanqienovel.com", "jjwxc.net", "zongheng.com", "qimao.com", "17k.com"];
pub(super) fn platform(value: &str) -> Option<(&'static str, &'static str, &'static str)> {
    let url = http::https_url(value).ok()?;
    match url.host_str()? {
        "www.qidian.com" | "qidian.com" | "book.qidian.com" | "m.qidian.com" => Some(("起点中文网", "qidian", SITES[0])),
        "fanqienovel.com" | "www.fanqienovel.com" => Some(("番茄小说", "fanqie", SITES[1])),
        "www.jjwxc.net" | "jjwxc.net" => Some(("晋江文学城", "jjwxc", SITES[2])),
        "www.zongheng.com" | "book.zongheng.com" | "m.zongheng.com" => Some(("纵横中文网", "zongheng", SITES[3])),
        "www.qimao.com" | "qimao.com" => Some(("七猫中文网", "qimao", SITES[4])),
        "www.17k.com" | "17k.com" | "h5.17k.com" => Some(("17K小说网", "17k", SITES[5])),
        _ => None,
    }
}
pub(super) fn additional_link(value: &str) -> Option<String> {
    let url = http::https_url(value).ok()?;
    let known_tab = url.host_str() == Some("www.zongheng.com") && url.path().starts_with("/detail/")
        && matches!(url.query(), Some("tabsName=bookinfo" | "tabsName=catalogue"));
    if url.query().is_some() && !known_tab { return None; }
    let parts: Vec<_> = url.path().trim_matches('/').split('/').collect();
    if parts.len() != 2 { return None; }
    let host = url.host_str()?;
    let (prefix, id) = match (host, parts[0]) {
        ("www.zongheng.com", "detail") | ("m.zongheng.com", "book") => ("https://www.zongheng.com/detail/", parts[1]),
        ("book.zongheng.com", "book") => ("https://www.zongheng.com/detail/", parts[1].strip_suffix(".html")?),
        ("www.qimao.com" | "qimao.com", "shuku") => ("https://www.qimao.com/shuku/", parts[1]),
        ("www.17k.com" | "17k.com" | "h5.17k.com", "book") => ("https://www.17k.com/book/", parts[1].strip_suffix(".html")?),
        _ => return None,
    };
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) { return None; }
    let suffix = if prefix.contains("17k.com") { ".html" } else if prefix.contains("qimao.com") { "/" } else { "" };
    Some(format!("{prefix}{id}{suffix}"))
}
