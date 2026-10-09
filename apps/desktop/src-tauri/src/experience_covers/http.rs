use reqwest::{Client, Response, Url, redirect::Policy};
use serde_json::Value;
use std::time::Duration;

pub fn request_error(error: reqwest::Error, source: &str) -> String {
    // Never expose the original error: it can contain a URL or proxy credentials.
    if error.is_timeout() { format!("{source}连接超时；请检查网络和Windows系统代理后重试，本地记录不受影响") }
    else if error.is_connect() { format!("{source}连接失败；请检查Windows代理软件是否运行，或网络能否访问该来源") }
    else { format!("{source}请求未完成；请稍后重试，本地记录不受影响") }
}

pub fn client() -> Result<Client, String> {
    Client::builder().https_only(true).redirect(Policy::none())
        .timeout(Duration::from_secs(12)).connect_timeout(Duration::from_secs(5))
        .user_agent("Yiyu/2.0 (personal-experience-covers; https://github.com/sudeyugan/personalized-platform)")
        .build().map_err(|_| "封面连接初始化失败".into())
}
pub async fn bytes(mut response: Response, limit: usize) -> Result<Vec<u8>, String> {
    if !response.status().is_success() { return Err(format!("来源暂不可用（HTTP {}），可使用书名封面", response.status().as_u16())); }
    let announced = response.headers().get(reqwest::header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok()).and_then(|value| value.parse::<u64>().ok());
    if announced.is_some_and(|size| size > limit as u64) || response.content_length().is_some_and(|size| size > limit as u64) {
        return Err("来源数据超过大小限制".into());
    }
    let mut data = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "读取来源数据失败，请稍后重试")? {
        if data.len() + chunk.len() > limit { return Err("来源数据超过大小限制".into()); }
        data.extend_from_slice(&chunk);
    }
    Ok(data)
}
pub async fn json(response: Response) -> Result<Value, String> {
    serde_json::from_slice(&bytes(response, 2 * 1024 * 1024).await?)
        .map_err(|_| "来源返回了无法识别的数据，请使用其他来源".into())
}
pub fn https_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "链接格式不正确")?;
    if value.len() > 2048 || url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() || url.port().is_some() || url.fragment().is_some() {
        return Err("仅支持不带账号、端口或片段的HTTPS作品链接".into());
    }
    Ok(url)
}
pub fn image_url(value: &str) -> Result<Url, String> {
    let url = https_url(value)?;
    let host = url.host_str().unwrap_or_default();
    let allowed = matches!(host, "lain.bgm.tv" | "covers.openlibrary.org" | "image.tmdb.org"
        | "cdn.weread.qq.com" | "wfqqreader-1252317822.image.myqcloud.com");
    let weread = matches!(host, "qpic.cn" | "mmbiz.qpic.cn" | "mmbiz.qlogo.cn" | "img1.qidian.com" | "img2.qidian.com");
    let fanqie = (1..=9).any(|n| host == format!("p{n}-novel-sign.byteimg.com") || host == format!("p{n}-tt.byteimg.com"));
    let path: Vec<_> = url.path().trim_matches('/').split('/').collect();
    let qidian = host == "qidian.qpic.cn" && url.query().is_none() && path.len() == 4
        && path[0] == "qdbimg" && path[1] == "349573" && path[3] == "180"
        && !path[2].is_empty() && path[2].chars().all(|c| c.is_ascii_digit());
    let jinjiang = (1..=9).any(|n| host == format!("i{n}-static.jjwxc.net")) && url.query().is_none()
        && url.path().starts_with("/tmp/backend/authorspace/")
        && [".jpg", ".jpeg", ".png", ".webp"].iter().any(|extension| url.path().ends_with(extension));
    let raster = [".jpg", ".jpeg", ".png", ".webp"].iter().any(|extension| url.path().ends_with(extension));
    let catalogue = url.query().is_none() && raster && (
        (host == "static.zongheng.com" && url.path().starts_with("/upload/cover/"))
        || (host == "cdn.wtzw.com" && url.path().starts_with("/bookimg/public/images/cover/")));
    if !allowed && !weread && !fanqie && !qidian && !jinjiang && !catalogue { return Err("图片地址不在已接入来源白名单内，可改用书名封面或本地图片".into()); }
    Ok(url)
}
pub fn image_mime(data: &[u8]) -> Result<&'static str, String> {
    if data.starts_with(&[0xff, 0xd8, 0xff]) { Ok("image/jpeg") }
    else if data.starts_with(b"\x89PNG\r\n\x1a\n") { Ok("image/png") }
    else if data.starts_with(b"RIFF") && data.get(8..12) == Some(b"WEBP") { Ok("image/webp") }
    else { Err("来源不是支持的JPG、PNG或WebP图片".into()) }
}
