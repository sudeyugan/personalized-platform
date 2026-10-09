use super::{http, links, providers, require_main, QueryLease, ImageLease, web_novels, web_novel_artwork};
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
#[ignore]
fn public_web_novel_desktop_network_probe() {
    tauri::async_runtime::block_on(async {
        for (title, author, host) in [("诡秘之主", "爱潜水的乌贼", "www.qidian.com"), ("我在精神病院学斩神", "三九音域", "fanqienovel.com")] {
            let candidates = web_novels::search(title, author).await.expect("公开作品目录查询失败");
            let matched = candidates.iter().find(|item| item.title == title && reqwest::Url::parse(&item.source_url).unwrap().host_str() == Some(host)).expect("未匹配预期官方作品");
            println!("Public work URL: {} ; cover provided={}", matched.source_url, matched.cover_url.is_some());
            let url = http::image_url(matched.cover_url.as_ref().expect("公开作品没有封面")).unwrap();
            let response = http::client().unwrap().get(url).send().await.unwrap();
            assert!(http::image_mime(&http::bytes(response, 5 * 1024 * 1024).await.unwrap()).is_ok());
            assert!(candidates.len() <= 6);
            println!("Public web novel: official metadata matched, allowed raster downloaded; no accounts or user records");
        }
    });
}

// Explicit opt-in to a configured search key; never print or transmit the key except to its provider.
#[test]
#[ignore]
fn public_reported_web_novel_desktop_network_probe() {
    tauri::async_runtime::block_on(async {
        let root = std::env::var("YIYU_PUBLIC_SEARCH_SECRETS").expect("请显式提供本机搜索密钥目录");
        let secrets = crate::repositories::SecretRepository::for_test(std::path::PathBuf::from(root));
        let search = crate::web_search::PreparedSearch::configured(crate::web_search::WebSearchConfig {
            provider_id: crate::web_search::WebSearchProvider::Tencent, fallback_to_bing: false,
        }, &secrets).unwrap();
        let candidates = web_novels::search_using("我加载了恋爱游戏", "", search).await.expect("反馈作品检索失败");
        let matched = candidates.iter().find(|item| item.title == "我的女友是恶劣大小姐" && item.source_url == "https://www.qidian.com/book/1021671831/").expect("未识别官方更名作品");
        assert_eq!(matched.matched_title.as_deref(), Some("我加载了恋爱游戏"));
        let url = http::image_url(matched.cover_url.as_ref().expect("候选没有封面")).unwrap();
        let response = http::client().unwrap().get(url).send().await.unwrap();
        let bytes = http::bytes(response, 5 * 1024 * 1024).await.unwrap();
        assert_eq!(http::image_mime(&bytes).unwrap(), "image/jpeg");
        assert!(candidates.len() <= 6);
        println!("Reported public title: official renamed work matched, allowed JPEG downloaded; no accounts or user records");
    });
}

#[test]
fn novel_cover_routes_are_bound_to_official_ids_and_public_cover_elements() {
    assert_eq!(web_novel_artwork::qidian_cover("https://book.qidian.com/info/123/").unwrap(), "https://qidian.qpic.cn/qdbimg/349573/123/180");
    for source in ["https://www.qidian.com/book/abc/", "https://www.qidian.com/ask/123", "https://evil.example/book/123/", "https://fanqienovel.com/page/123"] {
        assert!(web_novel_artwork::qidian_cover(source).is_none());
    }
    let image = "https://i5-static.jjwxc.net/tmp/backend/authorspace/s1/test.jpg";
    let html = format!("<img src='https://evil.example/ad.jpg'><img class='noveldefaultimage' _src='https://evil.example/ignored.jpg' src = '{image}'>");
    assert_eq!(web_novel_artwork::jinjiang_cover(&html).unwrap(), image);
    for html in ["<script>src='https://evil.example/a.jpg'</script>", "<img class='noveldefaultimage' src='https://evil.example/a.jpg'>", "<img class='noveldefaultimage' _src='https://i5-static.jjwxc.net/tmp/backend/authorspace/test.jpg'>"] {
        assert!(web_novel_artwork::jinjiang_cover(html).is_none());
    }
    for url in ["https://qidian.qpic.cn/qdbimg/349573/abc/180", "https://qidian.qpic.cn/other/349573/123/180", "https://qidian.qpic.cn/qdbimg/349573/123/180?redirect=1", "https://qidian.qpic.cn.evil.example/qdbimg/349573/123/180", "https://i5-static.jjwxc.net/novelimage.php?novelid=123", "https://i5-static.jjwxc.net/tmp/backend/authorspace/test.svg", "https://i5-static.jjwxc.net.evil.example/tmp/backend/authorspace/test.jpg"] {
        assert!(http::image_url(url).is_err(), "{url}");
    }
    assert!(http::image_url(image).is_ok());
}

#[test]
fn rename_ranking_marks_only_the_exact_title_on_the_same_official_platform() {
    use crate::web_search::WebSearchResult as Item;
    let mut found = web_novels::candidates(vec![
        Item::fixture("新名", "", "https://www.qidian.com/book/123/"),
        Item::fixture("新名", "", "https://www.jjwxc.net/onebook.php?novelid=456"),
        Item::fixture("关于旧名这件事", "", "https://www.qidian.com/book/789/"),
    ], "");
    web_novels::mark_aliases(&mut found, "旧名", &["新名 site:qidian.com".into()]);
    assert_eq!(found[0].matched_title.as_deref(), Some("旧名"));
    assert!(found[1..].iter().all(|candidate| candidate.matched_title.is_none()));
}

#[test]
#[ignore]
fn public_jinjiang_cover_desktop_network_probe() {
    tauri::async_runtime::block_on(async {
        let client = http::client().unwrap();
        let response = client.get("https://www.jjwxc.net/onebook.php?novelid=3200611").send().await.unwrap();
        let raw = http::bytes(response, 2 * 1024 * 1024).await.unwrap();
        let url = web_novel_artwork::jinjiang_cover(&String::from_utf8_lossy(&raw)).expect("公开页未提供封面");
        let response = client.get(http::image_url(&url).unwrap()).send().await.unwrap();
        let image = http::bytes(response, 5 * 1024 * 1024).await.unwrap();
        assert!(http::image_mime(&image).is_ok());
        println!("Public Jinjiang work page: allowed raster downloaded; no chapters or accounts");
    });
}

#[test]
fn web_novel_search_keeps_title_and_scopes_each_official_platform() {
    assert_eq!(web_novels::queries("诡秘之主"), ["诡秘之主 site:qidian.com", "诡秘之主 site:fanqienovel.com", "诡秘之主 site:jjwxc.net", "诡秘之主 site:zongheng.com", "诡秘之主 site:qimao.com", "诡秘之主 site:17k.com"]);
    assert_eq!(web_novels::queries("https://www.qidian.com/book/123/"), ["123 site:www.qidian.com"]);
    assert_eq!(web_novels::queries("https://www.jjwxc.net/onebook.php?novelid=456"), ["456 site:www.jjwxc.net"]);
    assert_eq!(web_novels::clean_title("我在精神病院学斩神完整版在线免费阅读_我在精神病院学斩神小说_番茄小说官网").0, "我在精神病院学斩神");
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
    assert_eq!(links::supported_link("https://www.qidian.com/book/123/").unwrap().0, "webnovel");
    for legacy in ["https://book.qidian.com/info/123/", "https://m.qidian.com/book/123/"] {
        assert_eq!(links::supported_link(legacy).unwrap().1, "https://www.qidian.com/book/123/");
    }
    assert_eq!(links::supported_link("https://www.jjwxc.net/onebook.php?novelid=456").unwrap().0, "webnovel");
    for url in ["https://fanqienovel.com/reader/1234", "https://fanqienovel.com/page/123?token=secret", "https://fanqienovel.com.evil.example/page/123", "https://fanqienovel.com/page/../../admin", "https://www.qidian.com/book/not-a-number", "https://www.jjwxc.net/onebook.php?novelid=456&token=secret", "https://localhost/page/123", "https://book.qidian.com.evil.example/info/123", "https://book.qidian.com/info/123?token=secret", "https://m.qidian.com/book/123/chapter/456"] {
        assert!(links::supported_link(url).is_err(), "{url}");
    }
}
#[test]
fn follows_only_explicit_official_rename_evidence_and_limits_followups() {
    use crate::web_search::WebSearchResult as Item;
    let snippet = "这本小说原名 《我加载了恋爱游戏》 ，现更名为 《我的女友是恶劣大小姐》 。";
    let official = Item::fixture("更名说明", snippet, "https://www.qidian.com/ask/abc");
    assert_eq!(web_novels::alias_queries("我加载了恋爱游戏", &[official]), ["我的女友是恶劣大小姐 site:qidian.com"]);
    for url in ["https://evil.example/ask/abc", "https://qidian.com.evil.example/ask/abc", "http://www.qidian.com/ask/abc", "https://user:secret@www.qidian.com/ask/abc"] {
        assert!(web_novels::alias_queries("我加载了恋爱游戏", &[Item::fixture("线索", snippet, url)]).is_empty());
    }
    for text in ["推荐《旧名》和《新名》", "《旧名》。另一部更名为《新名》", "《旧名》更名为《https://evil.example/》", "《并非旧名》更名为《新名》"] {
        assert!(web_novels::alias_queries("旧名", &[Item::fixture("线索", text, "https://www.qidian.com/ask/abc")]).is_empty());
    }
    let many = Item::fixture("线索", "《旧名》现已更名为《新名甲》。 《旧名》改名为《新名甲》。 《旧名》现名《新名乙》。 《旧名》更名为《新名丙》。", "https://www.qidian.com/ask/abc");
    assert_eq!(web_novels::alias_queries("旧名", &[many]), ["新名甲 site:qidian.com", "新名乙 site:qidian.com"]);
}
#[test]
fn candidates_normalize_legacy_ids_without_accepting_recommendation_or_chapter_pages() {
    use crate::web_search::WebSearchResult as Item;
    let items = vec![
        Item::fixture("新名（作者）小说在线阅读-首发起点中文网", "", "https://book.qidian.com/info/123/"),
        Item::fixture("新名", "", "https://m.qidian.com/book/123/"),
        Item::fixture("新名", "", "https://www.qidian.com/book/123/"),
        Item::fixture("推荐页", "《旧名》更名为《新名》", "https://www.qidian.com/ask/abc"),
        Item::fixture("正文", "", "https://m.qidian.com/book/123/chapter/456"),
    ];
    let found = web_novels::candidates(items, "");
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].title, "新名");
    assert_eq!(found[0].creator, "作者");
    assert_eq!(found[0].source_url, "https://www.qidian.com/book/123/");
}
#[test]
fn recognizes_only_official_web_novel_results_and_cleans_catalogue_titles() {
    assert_eq!(web_novels::source("https://www.qidian.com/book/1010868264/").unwrap().0, "起点中文网");
    assert_eq!(web_novels::source("https://fanqienovel.com/page/12345").unwrap().0, "番茄小说");
    assert_eq!(web_novels::source("https://www.jjwxc.net/onebook.php?novelid=123").unwrap().0, "晋江文学城");
    assert!(web_novels::source("https://qidian.com.evil.example/book/1010868264").is_none());
    assert!(web_novels::source("https://www.qidian.com/book/1010868264/?token=secret").is_none());
    assert!(web_novels::source("https://fanqienovel.com/page/12345?from=share").is_none());
    assert!(web_novels::source("https://www.jjwxc.net/onebook.php?novelid=123&token=secret").is_none());
    assert_eq!(web_novels::clean_title("诡秘之主（爱潜水的乌贼）小说在线阅读-首发起点中文网"), ("诡秘之主".into(), "爱潜水的乌贼".into()));
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
fn fanqie_keywords_follow_only_the_explicit_main_work_and_strip_known_tracking() {
    let fixture = |url: &str| format!("<script>window._SSR_DATA = {}; arbitrary();</script>", json!({"data":{"loadersData":{"route":{"data":{"main_novel":{"book_detail_page_url":url},"novel_hot_list":[{"book_detail_page_url":"https://evil.example/page/9"}]}}}}}));
    assert_eq!(links::parse_fanqie_keyword(&fixture("https://fanqienovel.com/page/123?source=seo_fq_juhe")).unwrap(), "https://fanqienovel.com/page/123");
    for url in ["https://evil.example/page/123", "https://fanqienovel.com.evil.example/page/123", "http://fanqienovel.com/page/123", "https://fanqienovel.com/keyword/123", "https://fanqienovel.com/reader/123", "https://fanqienovel.com/page/123?token=secret", "https://user:secret@fanqienovel.com/page/123", "https://fanqienovel.com/page/not-an-id"] {
        assert!(links::parse_fanqie_keyword(&fixture(url)).is_err());
    }
    assert!(links::parse_fanqie_keyword("window._SSR_DATA = alert(1)").is_err());
    assert!(links::parse_fanqie_keyword("<script>arbitrary()</script>").is_err());
    let multiple = format!("window._SSR_DATA = {}", json!({
        "data": { "loadersData": {
            "a": { "data": { "main_novel": { "book_detail_page_url": "https://fanqienovel.com/page/123" } } },
            "b": { "data": { "main_novel": { "book_detail_page_url": "https://fanqienovel.com/page/456" } } }
        } }
    }));
    assert!(links::parse_fanqie_keyword(&multiple).is_err());
}
#[test]
fn fanqie_page_ids_are_verified_and_cover_field_aliases_keep_the_host_guard() {
    let fixture = |id: &str, cover: &str| format!("window.__INITIAL_STATE__={};", json!({"page":{"bookId":id,"bookName":"作品甲","thumbUrl":"https://evil.example/image.jpg","thumbUri":cover}}));
    let candidate = links::parse_fanqie(&fixture("123", "https://p6-novel-sign.byteimg.com/novel-images/test.image"), "https://fanqienovel.com/page/123").unwrap();
    assert!(candidate.cover_url.is_some());
    assert!(links::parse_fanqie(&fixture("456", ""), "https://fanqienovel.com/page/123").is_err());
    assert!(links::parse_fanqie(&fixture("123", ""), "https://fanqienovel.com/keyword/123").is_err());
    assert!(links::parse_fanqie(&fixture("123", "https://evil.example/cover.jpg"), "https://fanqienovel.com/page/123").unwrap().cover_url.is_none());
}
#[test]
#[ignore]
fn public_shoumo_cover_desktop_network_probe() {
    tauri::async_runtime::block_on(async {
        let root = std::env::var("YIYU_PUBLIC_SEARCH_SECRETS").expect("请显式提供本机搜索密钥目录");
        let secrets = crate::repositories::SecretRepository::for_test(std::path::PathBuf::from(root));
        let search = crate::web_search::PreparedSearch::configured(crate::web_search::WebSearchConfig {
            provider_id: crate::web_search::WebSearchProvider::Tencent, fallback_to_bing: false,
        }, &secrets).unwrap();
        let candidates = web_novels::search_using("狩魔手记", "", search).await.unwrap();
        for item in &candidates { println!("Public candidate: {} | {} | {} | cover={}", item.title, item.creator, item.source_url, item.cover_url.is_some()); }
        let source = "https://fanqienovel.com/page/6569997419709205512";
        let matched = candidates.iter().find(|item| item.source_url == source && item.title == "狩魔手记" && item.creator == "烟雨江南").expect("没有匹配反馈作品");
        assert_eq!(candidates.iter().filter(|item| item.source_url == source).count(), 1);
        let client = http::client().unwrap();
        let resolved = links::fanqie_detail(&client, "https://fanqienovel.com/keyword/8003249").await.unwrap();
        assert_eq!(resolved.source_url, source);
        let response = client.get(http::image_url(matched.cover_url.as_ref().expect("匹配作品缺少封面")).unwrap()).send().await.unwrap();
        let image = http::bytes(response, 5 * 1024 * 1024).await.unwrap();
        assert!(http::image_mime(&image).is_ok());
        println!("Reported Shoumo: canonical work deduplicated, keyword resolved, allowed raster downloaded; no accounts or user records");
    });
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
