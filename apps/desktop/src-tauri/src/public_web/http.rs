use reqwest::header::{AGE, CACHE_CONTROL, CONTENT_TYPE, LOCATION};
use super::policy::{public_url, client};

pub const BODY_LIMIT: usize = 512 * 1024;

pub struct PublicResponse {
    pub url: String,
    pub content_type: String,
    pub text: String,
    pub cached: bool,
}

pub async fn fetch(raw: &str) -> Result<PublicResponse, String> {
    let url = public_url(raw)?;
    let mut response = client(&url).await?.get(url.clone())
        .header(CACHE_CONTROL, "no-cache, no-store").send().await
        .map_err(|error| if error.is_timeout() { "PUBLIC_WEB_TIMEOUT:公开来源连接超时" } else { "PUBLIC_WEB_NETWORK:公开来源连接失败（只支持直接网络，不使用系统代理）" })?;
    if response.status().is_redirection() {
        let next = response.headers().get(LOCATION).and_then(|value| value.to_str().ok())
            .and_then(|value| url.join(value).ok()).and_then(|url| public_url(url.as_str()).ok());
        return Err(match next {
            Some(next) => format!("PUBLIC_WEB_REDIRECT:来源要求重定向；没有跟随。可另行确认读取：{next}"),
            None => "PUBLIC_WEB_REDIRECT:来源要求不支持或不安全的重定向，已停止".into(),
        });
    }
    if !response.status().is_success() { return Err(format!("PUBLIC_WEB_HTTP:公开来源返回HTTP {}", response.status().as_u16())); }
    let content_type = response.headers().get(CONTENT_TYPE).and_then(|value| value.to_str().ok())
        .unwrap_or("").split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    if !matches!(content_type.as_str(), "text/html" | "text/plain" | "application/json") && !content_type.ends_with("+json") {
        return Err("PUBLIC_WEB_TYPE:只读取HTML、文本或JSON；不下载附件、图片或其他文件".into());
    }
    if response.content_length().is_some_and(|size| size > BODY_LIMIT as u64) { return Err("PUBLIC_WEB_SIZE:来源超过512KB限制".into()); }
    let cached = response.headers().get(AGE).and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok()).is_some_and(|age| age > 30);
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "PUBLIC_WEB_BODY:来源读取失败")? {
        if bytes.len() + chunk.len() > BODY_LIMIT { return Err("PUBLIC_WEB_SIZE:来源超过512KB限制".into()); }
        bytes.extend_from_slice(&chunk);
    }
    let text = String::from_utf8(bytes).map_err(|_| "PUBLIC_WEB_ENCODING:当前只支持UTF-8公开内容")?;
    Ok(PublicResponse { url: url.to_string(), content_type, text, cached })
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}
