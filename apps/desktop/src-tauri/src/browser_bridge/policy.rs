use reqwest::Url;

pub const PORT: u16 = 38471;
pub const MAX_BODY: usize = 131_072;
pub fn origin(raw: &str) -> Result<String, String> {
    let url = Url::parse(raw).map_err(|_| "BROWSER_SITE:请使用完整HTTPS网站地址")?;
    let host = url.host_str().ok_or("BROWSER_SITE:网站没有域名")?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some()
        || url.port().is_some() || url.query().is_some() || url.fragment().is_some()
        || url.path() != "/" || !host.contains('.') || host.contains('*') || host.parse::<std::net::IpAddr>().is_ok()
        || [".local", ".localhost", ".internal", ".test", ".invalid"].iter().any(|end| host.ends_with(end))
    { return Err("BROWSER_SITE:只允许公共HTTPS网站的精确域名，不允许端口、私网或通配符".into()); }
    Ok(url.origin().ascii_serialization())
}
pub fn sites(values: &[String]) -> Result<Vec<String>, String> {
    if values.len() > 32 { return Err("BROWSER_SITE:最多授权32个网站".into()); }
    let mut result = vec![];
    for value in values { let item = origin(value)?; if !result.contains(&item) { result.push(item); } }
    Ok(result)
}
pub fn extension_origin(value: &str) -> bool {
    value.strip_prefix("chrome-extension://").is_some_and(|id| id.len() == 32 && id.bytes().all(|c| (b'a'..=b'p').contains(&c)))
}
pub fn equal_secret(left: &str, right: &str) -> bool {
    left.len() == right.len() && left.bytes().zip(right.bytes()).fold(0_u8, |out, (a, b)| out | (a ^ b)) == 0
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn site_permissions_are_exact_public_origins() {
        assert_eq!(origin("https://live.bilibili.com/"), Ok("https://live.bilibili.com".into()));
        for bad in ["http://example.com", "https://*.example.com", "https://127.0.0.1", "https://example.local", "https://user:pass@example.com", "https://example.com/x", "https://example.com?token=x", "https://example.com:9999"] { assert!(origin(bad).is_err(), "{bad}"); }
    }
    #[test] fn no_web_origins_or_prefix_tricks() {
        assert!(extension_origin("chrome-extension://abcdefghijklmnopabcdefghijklmnop"));
        assert!(!extension_origin("https://example.com")); assert!(!extension_origin("chrome-extension://abcdefghijklmnopabcdefghijklmnop/evil"));
        assert!(equal_secret("abc", "abc")); assert!(!equal_secret("abc", "abcd")); assert!(!equal_secret("abc", "abd"));
    }
}
