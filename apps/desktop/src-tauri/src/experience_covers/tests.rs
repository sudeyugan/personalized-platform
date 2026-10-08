use super::{http, links, providers, require_main, QueryLease, ImageLease};
use serde_json::json;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

// Manual public sample; no account, key, user record or full image printed.
#[test]
#[ignore]
fn public_cover_desktop_network_probe() {
    tauri::async_runtime::block_on(async {
        let client = http::client().unwrap();
        let response = client.post("https://api.bgm.tv/v0/search/subjects?limit=3&offset=0")
            .json(&json!({"keyword":"葬送的芙莉莲","sort":"match","filter":{"type":[2],"nsfw":false}}))
            .send().await.map_err(|e| format!("cover timeout={} connect={}", e.is_timeout(), e.is_connect())).unwrap();
        let candidates = providers::parse_bangumi(&http::json(response).await.unwrap());
        assert!(!candidates.is_empty(), "公开示例未获得候选");
        let url = candidates.iter().find_map(|item| item.cover_url.as_ref()).expect("没有封面地址");
        let response = client.get(http::image_url(url).unwrap()).send().await
            .map_err(|e| format!("image timeout={} connect={}", e.is_timeout(), e.is_connect())).unwrap();
        let bytes = http::bytes(response, 5 * 1024 * 1024).await.unwrap();
        assert!(http::image_mime(&bytes).is_ok());
        println!("Public cover: metadata=true, allowed raster=true; no accounts or user records");
    });
}

#[test]
fn rejects_untrusted_windows_urls_and_non_raster_images() {
    assert!(require_main("main").is_ok());
    for label in ["companion", "companion-chat", "companion-feedback"] { assert!(require_main(label).is_err()); }
    for url in ["http://lain.bgm.tv/a.jpg", "https://127.0.0.1/a.jpg", "https://localhost/a.jpg", "file:///a.jpg",
        "https://lain.bgm.tv.evil.example/a.jpg", "https://user:secret@lain.bgm.tv/a.jpg", "https://lain.bgm.tv:8443/a.jpg", "https://evil.example/?url=https://lain.bgm.tv/a.jpg"] {
        assert!(http::image_url(url).is_err(), "{url}");
    }
    assert!(http::image_url("https://lain.bgm.tv/pic/cover/l/test.jpg").is_ok());
    assert!(http::image_mime(b"<svg onload='alert(1)'>").is_err());
    assert_eq!(http::image_mime(b"\xff\xd8\xffdata").unwrap(), "image/jpeg");
    assert_eq!(http::image_mime(b"\x89PNG\r\n\x1a\nbytes").unwrap(), "image/png");
    assert_eq!(http::image_mime(b"RIFF1234WEBPbytes").unwrap(), "image/webp");
}
#[test]
fn recognizes_only_verified_public_work_links() {
    assert_eq!(links::supported_link("https://fanqienovel.com/page/12345").unwrap().0, "fanqie");
    assert_eq!(links::supported_link("https://bangumi.tv/subject/400602").unwrap(), ("bangumi".into(), "400602".into()));
    for url in ["https://fanqienovel.com/reader/1234", "https://fanqienovel.com/page/123?token=secret", "https://fanqienovel.com.evil.example/page/123", "https://fanqienovel.com/page/../../admin", "https://www.qidian.com/book/123", "https://localhost/page/123"] {
        assert!(links::supported_link(url).is_err(), "{url}");
    }
}
#[test]
fn parses_public_page_json_without_evaluating_scripts() {
    let page = r#"<script>window.__INITIAL_STATE__={"page":{"bookName":"作品甲","author":"作者","bookId":"123","thumbUrl":"https://p6-novel-sign.byteimg.com/novel-pic/a.jpg"}}; evil();</script>"#;
    let candidate = links::parse_fanqie(page, "https://fanqienovel.com/page/123").unwrap();
    assert_eq!(candidate.title, "作品甲");
    assert_eq!(candidate.creator, "作者");
    assert!(candidate.cover_url.is_some());
    assert!(links::parse_fanqie("<html>请登录或验证</html>", "https://fanqienovel.com/page/123").is_err());
    assert!(links::parse_fanqie("window.__INITIAL_STATE__=alert(1)", "https://fanqienovel.com/page/123").is_err());
}
#[test]
fn trims_gateway_results_to_public_metadata_and_rejects_upgrade_errors() {
    let data = json!({"results":[{"scope":16,"books":[{"bookInfo":{"bookId":"1","title":"书名","author":"作者","cover":"https://cdn.weread.qq.com/weread/cover/a.jpg","note":"PRIVATE_NOTE"}}]}]});
    let result = providers::parse_weread(&data).unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].title, "书名");
    assert!(!serde_json::to_string(&result).unwrap().contains("PRIVATE_NOTE"));
    assert!(providers::parse_weread(&json!({"errcode":401})).is_err());
    assert!(providers::parse_weread(&json!({"upgrade_info":{"message":"upgrade"}})).is_err());
    assert!(providers::parse_weread(&json!({"results":[]})).unwrap().is_empty());
}
#[test]
fn bangumi_ids_and_names_remain_matched_and_invalid_cover_hosts_are_ignored() {
    let data = json!({"data":[{"id":400602,"name":"原名","name_cn":"葬送的芙莉莲","date":"2023-09-29","images":{"medium":"https://evil.example/pic.jpg"}}]});
    let result = providers::parse_bangumi(&data);
    assert_eq!(result[0].title, "葬送的芙莉莲");
    assert_eq!(result[0].source_url, "https://bgm.tv/subject/400602");
    assert!(result[0].cover_url.is_none());
}
#[test]
fn leases_release_busy_flags_and_image_limits_even_on_error() {
    let active = AtomicBool::new(true);
    { let _lease = QueryLease(&active); }
    assert!(!active.load(Ordering::SeqCst));
    let images = AtomicUsize::new(1);
    { let _lease = ImageLease(&images); }
    assert_eq!(images.load(Ordering::SeqCst), 0);
}
#[test]
fn response_limits_reject_redirects_html_and_oversize_bodies() {
    tauri::async_runtime::block_on(async {
        let response: reqwest::Response = tauri::http::Response::builder().status(302).body("redirect").unwrap().into();
        assert!(http::bytes(response, 100).await.is_err());
        let response: reqwest::Response = tauri::http::Response::builder().status(200).header("content-length", "1000").body("small").unwrap().into();
        assert!(http::bytes(response, 100).await.is_err());
        let response: reqwest::Response = tauri::http::Response::builder().status(200).body("oversize").unwrap().into();
        assert!(http::bytes(response, 3).await.is_err());
        let response: reqwest::Response = tauri::http::Response::builder().status(200).body("<html>blocked</html>").unwrap().into();
        assert!(http::json(response).await.is_err());
    });
}
