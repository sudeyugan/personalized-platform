use super::{CoverCandidate, http};
use reqwest::Client;
use serde_json::{Value, json};
use crate::repositories::SecretRepository;

fn field(value: &Value, key: &str) -> String { value[key].as_str().unwrap_or("").chars().take(250).collect() }
fn provider_label(provider: &str) -> &str {
    match provider { "bangumi" => "Bangumi", "openlibrary" => "Open Library", "tmdb" => "TMDB", _ => "微信读书" }
}
fn image(value: &str) -> Option<String> { http::image_url(value).ok().map(|url| url.to_string()) }
fn cover_field(value: &Value, key: &str) -> Option<String> { value[key].as_str().and_then(image) }
fn candidate(id: String, provider: &str, title: String, creator: String, year: String, cover_url: Option<String>, source_url: String) -> CoverCandidate {
    CoverCandidate { id, provider: provider.into(), title, creator, year, cover_url, source_url, credit: match provider {
        "bangumi" => "封面与条目信息：Bangumi",
        "openlibrary" => "封面与书目信息：Open Library",
        "tmdb" => "This product uses the TMDB API but is not endorsed or certified by TMDB.",
        _ => "书籍信息与封面：微信读书",
    }.into() }
}
pub async fn search(client: &Client, provider: &str, category: &str, query: &str, creator: &str, secrets: &SecretRepository) -> Result<Vec<CoverCandidate>, String> {
    match provider {
        "weread" => {
            let key = secrets.load("experiences-weread")?.ok_or("请先配置微信读书API Key，或使用书名封面")?;
            let response = client.post("https://i.weread.qq.com/api/agent/gateway").bearer_auth(key)
                .json(&json!({"api_name":"/store/search", "keyword":query, "scope":if category == "novel" {16} else {10}, "count":6, "skill_version":"1.0.4"}))
                .send().await.map_err(|error| http::request_error(error, provider_label(provider)))?;
            parse_weread(&http::json(response).await?)
        }
        "bangumi" => {
            let kind = match category { "anime" => 2, "game" => 4, _ => 1 };
            let response = client.post("https://api.bgm.tv/v0/search/subjects?limit=6&offset=0")
                .json(&json!({"keyword":query,"sort":"match","filter":{"type":[kind],"nsfw":false}}))
                .send().await.map_err(|error| http::request_error(error, provider_label(provider)))?;
            Ok(parse_bangumi(&http::json(response).await?))
        }
        "openlibrary" => {
            let mut request = client.get("https://openlibrary.org/search.json")
                .query(&[("title",query),("limit","6"),("fields","key,title,author_name,cover_i,first_publish_year")]);
            if !creator.is_empty() { request = request.query(&[("author", creator)]); }
            let response = request
                .send().await.map_err(|error| http::request_error(error, provider_label(provider)))?;
            let value = http::json(response).await?;
            Ok(value["docs"].as_array().into_iter().flatten().take(6).filter_map(|item| {
                let key = field(item,"key");
                if !key.strip_prefix("/works/OL").is_some_and(|id| !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric())) { return None; }
                Some(candidate(key.clone(),"openlibrary",field(item,"title"),
                    item["author_name"].as_array().and_then(|a|a.first()).and_then(Value::as_str).unwrap_or("").into(),
                    item["first_publish_year"].as_u64().map(|v|v.to_string()).unwrap_or_default(),
                    item["cover_i"].as_u64().map(|id| format!("https://covers.openlibrary.org/b/id/{id}-M.jpg?default=false")),
                    format!("https://openlibrary.org{key}")))
            }).collect())
        }
        "tmdb" => {
            let key = secrets.load("experiences-tmdb")?.ok_or("请先配置TMDB API Read Access Token，或使用文字封面")?;
            let kind = if category == "film" {"movie"} else {"tv"};
            let response = client.get(format!("https://api.themoviedb.org/3/search/{kind}")).bearer_auth(key)
                .query(&[("query",query),("language","zh-CN"),("include_adult","false")])
                .send().await.map_err(|error| http::request_error(error, provider_label(provider)))?;
            let value = http::json(response).await?;
            Ok(value["results"].as_array().into_iter().flatten().take(6).filter_map(|item| {
                let id = item["id"].as_u64()?;
                let title = field(item, if kind == "movie" {"title"} else {"name"});
                let date = field(item, if kind == "movie" {"release_date"} else {"first_air_date"});
                let poster = field(item,"poster_path");
                let cover = if poster.starts_with('/') && !poster.contains("..") { image(&format!("https://image.tmdb.org/t/p/w342{poster}")) } else { None };
                Some(candidate(id.to_string(),"tmdb",title,String::new(),date.chars().take(4).collect(),cover,format!("https://www.themoviedb.org/{kind}/{id}")))
            }).collect())
        }
        _ => Err("尚未接入这个封面来源".into()),
    }
}
pub fn parse_weread(value: &Value) -> Result<Vec<CoverCandidate>, String> {
    if value.get("upgrade_info").is_some_and(|v| !v.is_null()) { return Err("微信读书要求更新接口版本，已停止本次搜索".into()); }
    if value["errcode"].as_i64().is_some_and(|code| code != 0) { return Err("微信读书未接受请求，请检查密钥或稍后重试".into()); }
    // Official gateway may wrap payload in data; handle both without exposing private fields.
    let payload = if value["results"].is_array() { value } else { &value["data"] };
    let results: Vec<_> = payload["results"].as_array().into_iter().flatten()
        .flat_map(|group| group["books"].as_array().into_iter().flatten()).take(6)
        .filter_map(|book| {
            let item = &book["bookInfo"];
            let title = field(item,"title"); if title.is_empty() { return None; }
            let id = field(item,"bookId");
            // Do not invent a reading deep link when the source did not provide one.
            let url = http::https_url(&field(item,"deepLink")).ok().filter(|u| u.host_str() == Some("weread.qq.com")).map(|u|u.to_string())
                .unwrap_or_else(|| "https://weread.qq.com/".into());
            Some(candidate(id,"weread",title,field(item,"author"),String::new(),cover_field(item,"cover"),url))
        }).collect();
    Ok(results)
}
pub fn parse_bangumi(value: &Value) -> Vec<CoverCandidate> {
    value["data"].as_array().into_iter().flatten().take(6).filter_map(|item| {
        let id = item["id"].as_u64()?;
        let name_cn = field(item,"name_cn");
        Some(candidate(id.to_string(),"bangumi",if name_cn.is_empty() {field(item,"name")} else {name_cn},
            field(item,"name"),field(item,"date").chars().take(4).collect(),cover_field(&item["images"],"medium"),
            format!("https://bgm.tv/subject/{id}")))
    }).collect()
}
pub async fn bangumi_detail(client: &Client, id: &str) -> Result<CoverCandidate, String> {
    let response = client.get(format!("https://api.bgm.tv/v0/subjects/{id}")).send().await.map_err(|error| http::request_error(error, "Bangumi"))?;
    parse_bangumi(&json!({"data":[http::json(response).await?]})).into_iter().next().ok_or("未识别到Bangumi条目".into())
}
