use super::{policy, html, bilibili, read, ReadKind};
use serde_json::json;

#[test]
fn public_addresses_only() {
    for ip in ["127.0.0.1", "10.2.3.4", "172.20.1.1", "192.168.0.1", "169.254.169.254", "100.64.1.1", "0.0.0.0", "198.18.0.1", "192.0.2.1", "203.0.113.3", "224.0.0.1", "255.255.255.255", "::1", "::ffff:8.8.8.8", "fc00::1", "fe80::1", "2001:db8::1", "2002:0808:0808::1"] {
        assert!(!policy::public_ip(ip.parse().unwrap()), "{ip}");
    }
    for ip in ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2001:4860:4860::8888"] { assert!(policy::public_ip(ip.parse().unwrap())); }
    assert!(policy::checked_addresses(vec!["8.8.8.8:443".parse().unwrap(), "127.0.0.1:443".parse().unwrap()]).is_err());
    assert!(policy::checked_addresses(vec![]).is_err());
}

#[test]
fn urls_cannot_supply_credentials_or_private_destinations() {
    for url in ["http://example.com", "file:///tmp/private", "https://user:pass@example.com", "https://localhost", "https://printer.local", "https://cloud.internal", "https://example.com:8443", "https://example.com/#private", "https://127.1", "https://2130706433", "https://[::1]", "https://example.com/?access_token=x", "https://example.com/?api_key=x", "https://example.com./", "https://example.com/?sessionid=x"] { assert!(policy::public_url(url).is_err(), "{url}"); }
    assert!(policy::public_url("https://example.com/article?q=公开资料").is_ok());
}

#[test]
fn extract_static_text_without_scripts_comments_or_unsafe_links() {
    let base = reqwest::Url::parse("https://example.com/news").unwrap();
    let page = html::extract("<html><head><title>中文 &amp; 资料</title><style>secret</style></head><body><script>evil('fake status')</script><!-- hidden --><h1>今日</h1><a title='x > y' href='/item?id=2'>正文</a><a href='https://127.0.0.1/'>bad</a><a href='javascript:alert(1)'>js</a><template>private</template><p>文字</p></body></html>", &base);
    assert_eq!(page.title, "中文 & 资料");
    assert!(page.text.contains("今日"));
    assert!(!page.text.contains("evil")); assert!(!page.text.contains("hidden")); assert!(!page.text.contains("private"));
    assert_eq!(page.links.len(), 1); assert_eq!(page.links[0].url, "https://example.com/item?id=2");
    assert!(!page.truncated);
    assert!(html::extract(&"一".repeat(12001), &base).truncated);
    assert_eq!(html::extract("<script>未闭合不读取", &base).text, "");
}

fn room(status: serde_json::Value) -> serde_json::Value { json!({"data":{"room_id":1234,"uid":999,"live_status":status}}) }
fn master() -> serde_json::Value { json!({"data":{"room_id":1234,"info":{"uid":999,"uname":"测试主播"}}}) }

#[test]
fn live_status_requires_identity_and_explicit_numeric_state() {
    for (number, expected) in [(0, "offline"), (1, "live"), (2, "replay")] { assert_eq!(bilibili::verify(&room(json!(number)), &master(), 1234, "测试主播").unwrap().0, expected); }
    for status in [json!(null), json!("0"), json!(false), json!(3)] { assert!(bilibili::verify(&room(status), &master(), 1234, "测试主播").is_err()); }
    assert!(bilibili::verify(&room(json!(1)), &master(), 5678, "测试主播").is_err());
    assert!(bilibili::verify(&room(json!(1)), &master(), 1234, "另一主播").is_err());
    let mut wrong = master(); wrong["data"]["info"]["uid"] = json!(888);
    assert!(bilibili::verify(&room(json!(1)), &wrong, 1234, "测试主播").is_err());
}

#[test]
fn only_canonical_official_room_urls() {
    assert_eq!(bilibili::room_id("https://live.bilibili.com/1234").unwrap(), "1234");
    for url in ["https://live.bilibili.com.evil.com/1234", "https://live.bilibili.com/0", "https://live.bilibili.com/1234?token=x", "https://www.bilibili.com/video/1234", "https://live.bilibili.com/1/2"] { assert!(bilibili::room_id(url).is_err()); }
}

#[test]
fn json_selection_preserves_types_and_marks_truncation() {
    let response = |text: String| super::http::PublicResponse { url: "https://example.com/".into(), content_type: "application/json".into(), text, cached: false };
    let result = super::decode_response(response("{\"data\":[{\"value\":false}]}".into()), ReadKind::Json, Some("/data/0/value")).unwrap();
    assert_eq!(result.data, Some(json!(false))); assert!(!result.truncated);
    assert!(super::decode_response(response("{\"data\":1}".into()), ReadKind::Json, Some("/missing")).is_err());
    assert!(super::decode_response(response("not json".into()), ReadKind::Json, None).is_err());
    let result = super::decode_response(response(serde_json::to_string(&"字".repeat(12001)).unwrap()), ReadKind::Json, None).unwrap();
    assert!(result.truncated); assert!(result.data.is_none()); assert_eq!(result.text.unwrap().chars().count(), 12000);
}

#[test]
#[ignore = "Explicit anonymous public network probe, no model/credentials/private records"]
fn anonymous_public_read_probe() {
    tauri::async_runtime::block_on(async {
        let page = read("https://example.com/", ReadKind::Page, None).await.unwrap();
        assert_eq!(page.title.as_deref(), Some("Example Domain"));
        assert!(page.text.unwrap_or_default().contains("documentation examples"));
        println!("public_page_verified=true");
        let data = read("https://api.github.com/repos/rust-lang/rust", ReadKind::Json, Some("/full_name")).await.unwrap();
        assert_eq!(data.data, Some(json!("rust-lang/rust")));
        println!("public_json_verified=true");
        let live = bilibili::query("https://live.bilibili.com/1733394496", "天才美少女卡莎").await.unwrap();
        println!("public_live_status={} reason={}", live.status, live.reason);
        assert!(["live", "offline", "replay", "unknown"].contains(&live.status));
    });
}
