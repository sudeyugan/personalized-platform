use super::{http, links, novel_matching, novel_metadata, web_novels};
use crate::web_search::WebSearchResult as Item;

#[test]
fn catalogue_search_matrix_keeps_titles_authors_and_real_identity_separate() {
    for (query, author, title, by) in [
        (" 雪中悍刀行 ", "", "雪中悍刀行", ""),
        ("《雪中悍刀行》 烽火戏诸侯著", "", "雪中悍刀行", "烽火戏诸侯"),
        ("雪 中 悍 刀 行", "", "雪中悍刀行", ""),
        ("雪中悍刀行 作者：烽火戏诸侯", "", "雪中悍刀行", "烽火戏诸侯"),
        ("《同名作品》不确定的作者", "真实作者", "同名作品", "真实作者"),
        ("Ｈａｒｒｙ Potter", "", "Harry Potter", ""),
        ("龙族 III 黑月之潮", "", "龙族 III 黑月之潮", ""),
        ("\u{200b}雪中悍刀行\u{feff}", "", "雪中悍刀行", ""),
    ] { assert_eq!(novel_matching::input(query, author), (title.into(), by.into())); }
    let unknown = web_novels::candidates(vec![Item::fixture("同名作品", "", "https://www.qidian.com/book/1/")], "作者提示");
    assert!(unknown[0].creator.is_empty(), "提示不能伪造候选作者");
    assert_eq!(web_novels::clean_title("雪中悍刀行(烽火戏诸侯)最新章节全本在线阅读-纵横中文网官方正版"), ("雪中悍刀行".into(), "烽火戏诸侯".into()));
    assert_eq!(web_novels::clean_title("修罗武神_善良的蜜蜂_修罗武神最新章节_在线阅读-17K小说网"), ("修罗武神".into(), "善良的蜜蜂".into()));
    assert_eq!(web_novels::clean_title("《天官赐福》墨香铜臭_晋江文学城"), ("天官赐福".into(), "墨香铜臭".into()));
}
#[test]
fn exact_works_after_many_derivatives_are_not_lost_to_the_candidate_limit() {
    let mut items: Vec<_> = (1..=9).map(|id| Item::fixture("雪中悍刀行之另一个故事", "", &format!("https://www.qidian.com/book/{id}/"))).collect();
    items.push(Item::fixture("雪中悍刀行(烽火戏诸侯)最新章节全本在线阅读-纵横中文网官方正版", "", "https://book.zongheng.com/book/189169.html"));
    items.push(Item::fixture("电视剧雪中悍刀行", "", "https://tv.example/title/189169"));
    items.push(Item::fixture("毫无关系的作品", "雪中悍刀行", "https://www.qidian.com/book/123/"));
    let found = novel_matching::finish(web_novels::candidates(items, ""), "雪中悍刀行", "烽火戏诸侯");
    assert_eq!(found[0].title, "雪中悍刀行");
    assert_eq!(found[0].source_url, "https://www.zongheng.com/detail/189169");
    assert_eq!(found.len(), 6);
    assert!(!found.iter().any(|item| item.title.contains("电视剧") || item.title == "毫无关系的作品"));
}
#[test]
fn added_catalogues_accept_only_canonical_work_paths() {
    for (source, canonical) in [
        ("https://book.zongheng.com/book/189169.html", "https://www.zongheng.com/detail/189169"),
        ("https://m.zongheng.com/book/189169", "https://www.zongheng.com/detail/189169"),
        ("https://www.zongheng.com/detail/189169?tabsName=bookinfo", "https://www.zongheng.com/detail/189169"),
        ("https://www.zongheng.com/detail/189169?tabsName=catalogue", "https://www.zongheng.com/detail/189169"),
        ("https://qimao.com/shuku/215227", "https://www.qimao.com/shuku/215227/"),
        ("https://h5.17k.com/book/493239.html", "https://www.17k.com/book/493239.html"),
    ] { assert_eq!(links::supported_link(source).unwrap().1, canonical); }
    for source in ["https://www.zongheng.com/detail/abc", "https://read.zongheng.com/chapter/1/2.html", "https://book.zongheng.com/showchapter/1.html", "https://www.zongheng.com/baike/1", "https://www.zongheng.com.evil.example/detail/1", "https://www.qimao.com/shuku/1-2/", "https://www.qimao.com/shuku/0-1-a/", "https://www.17k.com/chapter/1/2.html", "https://www.17k.com/book/1.html?token=secret", "https://user:secret@www.zongheng.com/detail/1", "http://www.zongheng.com/detail/1"] {
        assert!(links::supported_link(source).is_err(), "{source}");
    }
}
#[test]
fn encyclopedia_clues_require_unique_named_work_references_and_never_follow_http() {
    let fixture = |href: &str, name: &str| format!("<p class='reference-cell-link'><a href='{href}'>{name}</a></p>");
    let old = fixture("http://book.zongheng.com/book/189169.html", "《雪中悍刀行》");
    assert_eq!(super::novel_clues::work_reference(&old, "雪中悍刀行").unwrap(), "https://www.zongheng.com/detail/189169");
    assert!(super::novel_clues::work_reference(&(old.clone() + &old), "雪中悍刀行").is_ok());
    assert!(super::novel_clues::work_reference(&(old.clone() + &fixture("https://www.zongheng.com/detail/456", "雪中悍刀行")), "雪中悍刀行").is_err());
    for href in ["http://evil.example/book/123.html", "https://book.zongheng.com.evil.example/book/123.html", "https://book.zongheng.com/showchapter/123.html", "https://read.zongheng.com/chapter/1/2.html", "https://www.zongheng.com/detail/1?token=secret", "https://user:pass@www.zongheng.com/detail/1", "http://book.zongheng.com/book/123.html?token=secret"] { assert!(super::novel_clues::work_reference(&fixture(href, "雪中悍刀行"), "雪中悍刀行").is_err()); }
    assert!(super::novel_clues::work_reference(&old, "剑来").is_err());
    assert!(super::novel_clues::work_reference("<script>read('https://www.zongheng.com/detail/1')</script>", "雪中悍刀行").is_err());
    let (title, author) = web_novels::clean_title("雪中悍刀行（张若昀、李庚希主演）小说在线阅读-首发起点中文网");
    assert!(title.contains("主演")); assert!(author.is_empty());
}
#[test]
fn official_metadata_is_bound_to_the_work_not_ads_or_recommendations() {
    let page = r#"<head><meta name="og:novel:book_name" content="作品甲"><meta property="og:novel:author" content="作者"><meta name="og:novel:read_url" content="//www.zongheng.com/detail/123"><meta name="og:image" content="https://static.zongheng.com/upload/cover/a/test.jpeg"></head><img src="https://evil.example/ad.jpg"><script>evil()</script>"#;
    let found = novel_metadata::parse(page, "https://www.zongheng.com/detail/123").unwrap();
    assert_eq!(found.title, "作品甲"); assert_eq!(found.creator, "作者"); assert!(found.cover_url.is_some());
    assert!(novel_metadata::parse(page, "https://www.zongheng.com/detail/456").is_err());
    assert!(novel_metadata::parse("<html>请验证<script>evil()</script></html>", "https://www.zongheng.com/detail/123").is_err());
    let blocked = page.replace("https://static.zongheng.com/upload/cover/a/test.jpeg", "https://evil.example/a.jpg");
    assert!(novel_metadata::parse(&blocked, "https://www.zongheng.com/detail/123").unwrap().cover_url.is_none());
    let qimao = r#"<title>作品甲免费阅读-作者-七猫中文网</title><div class="book-information"><div class="wrap-pic"><img src="https://cdn.wtzw.com/bookimg/public/images/cover/a/test.jpg"></div><div class="title"><span class="txt">作品甲</span></div><a href="https://www.qimao.com/zuozhe/test/">作者甲</a><div class="update-info"><span class="update-chapter-title"><a href="https://www.qimao.com/shuku/123-1/">最近更新</a></span>正文与推荐<img src="https://evil.example/a.jpg">"#;
    let found = novel_metadata::parse(qimao, "https://www.qimao.com/shuku/123/").unwrap();
    assert_eq!(found.creator, "作者甲"); assert!(found.cover_url.is_some());
    assert!(novel_metadata::parse(qimao, "https://www.qimao.com/shuku/456/").is_err());
    for url in ["https://static.zongheng.com/upload/cover/a/test.svg", "https://static.zongheng.com/other/test.jpg", "https://cdn.wtzw.com/ad/test.jpg", "https://cdn.wtzw.com/bookimg/public/images/cover/a/test.jpg?redirect=1"] { assert!(http::image_url(url).is_err()); }
}
#[test]
#[ignore]
fn public_expanded_novel_desktop_network_probe() {
    tauri::async_runtime::block_on(async {
        let root = std::env::var("YIYU_PUBLIC_SEARCH_SECRETS").expect("需显式指定已有搜索密钥目录");
        let secrets = crate::repositories::SecretRepository::for_test(root.into());
        let search = crate::web_search::PreparedSearch::configured(crate::web_search::WebSearchConfig { provider_id: crate::web_search::WebSearchProvider::Tencent, fallback_to_bing: false }, &secrets).unwrap();
        for (query, author, expected, source) in [
            ("雪中悍刀行", "", "雪中悍刀行", "https://www.zongheng.com/detail/189169"),
            ("《雪中悍刀行》 烽火戏诸侯著", "", "雪中悍刀行", "https://www.zongheng.com/detail/189169"),
            ("剑来", "烽火戏诸侯", "剑来", "https://www.zongheng.com/detail/672340"),
        ] {
            let found = web_novels::search_using(query, author, search.clone()).await.unwrap();
            for item in &found { println!("Public expanded candidate: {} | {} | {} | cover={}", item.title, item.creator, item.source_url, item.cover_url.is_some()); }
            let matched = found.iter().find(|item| item.title == expected && item.source_url == source && item.creator == "烽火戏诸侯").expect("未匹配原作");
            assert_eq!(found[0].source_url, source); assert!(found.len() <= 6);
            assert!(http::image_url(matched.cover_url.as_ref().expect("原作无封面地址")).is_ok());
        }
        let client = http::client().unwrap();
        let found = links::resolve(&client, "https://book.zongheng.com/book/189169.html", search.clone()).await.unwrap();
        assert_eq!(found.title, "雪中悍刀行");
        let found = links::resolve(&client, "https://www.qimao.com/shuku/215227/", search).await.unwrap();
        assert_eq!(found.title, "冰火魔厨"); assert_eq!(found.creator, "唐家三少");
        assert!(http::image_url(found.cover_url.as_ref().unwrap()).is_ok());
        println!("Expanded public metadata matrix: title, explicit author, short title, canonical old link and Qimao header verified; image downloads require the independent raster probe");
    });
}
#[test]
#[ignore]
fn public_expanded_novel_raster_desktop_network_probe() {
    tauri::async_runtime::block_on(async {
        let client = http::client().unwrap();
        let mut failures = Vec::new();
        for source in ["https://www.zongheng.com/detail/189169", "https://www.zongheng.com/detail/672340", "https://www.qimao.com/shuku/215227/"] {
            let result = async {
                let found = novel_metadata::detail(&client, source).await?;
                let url = http::image_url(found.cover_url.as_ref().ok_or("公开作品没有封面地址")?)?;
                let response = client.get(url).send().await.map_err(|error| http::request_error(error, "公开封面"))?;
                let data = http::bytes(response, 5 * 1024 * 1024).await?;
                http::image_mime(&data)?;
                Ok::<(), String>(())
            }.await;
            match result {
                Ok(()) => println!("Public expanded raster: {source} | allowed raster downloaded"),
                Err(error) => { println!("Public expanded raster: {source} | {error}"); failures.push(source); }
            }
        }
        assert!(failures.is_empty(), "有公开来源图片未下载成功：{failures:?}");
    });
}
