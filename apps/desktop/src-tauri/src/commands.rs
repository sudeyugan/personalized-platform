use std::{collections::HashSet, error::Error as _, sync::Mutex, time::Duration};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::Serialize;
use serde_json::Value;
use tauri::ipc::{Channel, InvokeBody, Response};
use tauri::{AppHandle, State, WebviewWindow};

use crate::{
    repositories::{
        AssetReceipt, AssetRepository, AudioReceipt, AudioRepository, BackupPreview, BackupReceipt,
        BackupRepository, DiagnosticRepository, ExportFile, LibraryRepository, LibrarySnapshot,
        RecoveryDraft, RecoveryRepository, SaveReceipt, SearchHit, SecretRepository, StorageStatus,
        TransferRepository, VaultRepository, configure_storage_root, storage_root, storage_status,
    },
    services::LibraryService,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    runtime: &'static str,
    storage: &'static str,
    library_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResult {
    title: String,
    snippet: String,
    url: String,
}

fn xml_value(item: &str, tag: &str) -> String {
    let start_tag = format!("<{tag}>");
    let end_tag = format!("</{tag}>");
    let Some(start) = item.find(&start_tag).map(|index| index + start_tag.len()) else { return String::new() };
    let Some(end) = item[start..].find(&end_tag).map(|index| start + index) else { return String::new() };
    item[start..end]
        .replace("<![CDATA[", "").replace("]]>", "")
        .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
        .replace("&quot;", &char::from(34).to_string()).replace("&#39;", "'")
        .trim().to_string()
}

fn strip_html(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut inside = false;
    for character in value.chars() {
        match character {
            '<' => inside = true,
            '>' => inside = false,
            _ if !inside => output.push(character),
            _ => {}
        }
    }
    output.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_allowed_bing_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https" && matches!(url.host_str(), Some("www.bing.com" | "cn.bing.com"))
}

fn parse_web_search(body: &str) -> Vec<WebSearchResult> {
    body.split("<item>").skip(1).take(6).filter_map(|item| {
        let title = strip_html(&xml_value(item, "title"));
        let snippet = strip_html(&xml_value(item, "description"));
        let url = xml_value(item, "link");
        (!title.is_empty() && url.starts_with("https://")).then_some(WebSearchResult { title, snippet, url })
    }).collect()
}

fn classify_web_search_error(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() { return "TIMEOUT"; }
    if error.is_redirect() { return "REDIRECT"; }
    let mut details = error.to_string().to_ascii_lowercase();
    let mut source = error.source();
    while let Some(current) = source {
        details.push_str(&current.to_string().to_ascii_lowercase());
        source = current.source();
    }
    if details.contains("dns") || details.contains("name resolution") || details.contains("lookup address") { "DNS" }
    else if details.contains("certificate") || details.contains("tls") || details.contains("ssl") { "TLS" }
    else if details.contains("proxy") || details.contains("tunnel") { "PROXY" }
    else if error.is_connect() { "CONNECT" }
    else { "REQUEST" }
}

async fn fetch_web_search(query: &str) -> Result<Vec<WebSearchResult>, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 3 || !is_allowed_bing_url(attempt.url()) {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Yiyu/2.0")
        .build().map_err(|error| format!("WEB_SEARCH_CLIENT:{error}"))?;
    let mut failures = Vec::new();
    for (label, endpoint) in [("www", "https://www.bing.com/search"), ("cn", "https://cn.bing.com/search")] {
        let response = match client.get(endpoint)
            .header(reqwest::header::ACCEPT, "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8")
            .header(reqwest::header::ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
            .query(&[("format", "rss"), ("setlang", "zh-hans"), ("q", query)])
            .send().await {
                Ok(response) => response,
                Err(error) => { failures.push(format!("{label}:{}", classify_web_search_error(&error))); continue; }
            };
        if !is_allowed_bing_url(response.url()) {
            failures.push(format!("{label}:REDIRECT_DENIED"));
            continue;
        }
        if !response.status().is_success() {
            failures.push(format!("{label}:HTTP_{}", response.status().as_u16()));
            continue;
        }
        let body = match response.text().await {
            Ok(body) => body,
            Err(_) => { failures.push(format!("{label}:BODY")); continue; }
        };
        let results = parse_web_search(&body);
        if !results.is_empty() { return Ok(results); }
        failures.push(format!("{label}:EMPTY_RSS"));
    }
    Err(format!("WEB_SEARCH_UNAVAILABLE:{}", failures.join(" | ")))
}

#[tauri::command]
pub async fn web_search(window: WebviewWindow, query: String) -> Result<Vec<WebSearchResult>, String> {
    require_main(&window)?;
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 200 {
        return Err("WEB_SEARCH_QUERY_INVALID:查询词不能为空且不能超过 200 字".into());
    }
    fetch_web_search(query).await
}

fn require_main(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("WINDOW_CAPABILITY_DENIED:桌面伙伴不能调用资料库命令".into())
    }
}

#[derive(Default)]
pub struct CompanionAssetScope(Mutex<HashSet<String>>);

fn valid_asset_id(id: &str) -> bool {
    id.starts_with("asset-") && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

#[tauri::command]
pub fn set_companion_asset_scope(
    window: WebviewWindow,
    scope: State<'_, CompanionAssetScope>,
    ids: Vec<String>,
) -> Result<(), String> {
    require_main(&window)?;
    if ids.len() > 80 || ids.iter().any(|id| !valid_asset_id(id)) {
        return Err("COMPANION_ASSET_SCOPE_INVALID:伙伴显示素材清单无效".into());
    }
    *scope
        .0
        .lock()
        .map_err(|_| "COMPANION_ASSET_SCOPE_LOCKED:伙伴素材清单暂不可用")? =
        ids.into_iter().collect();
    Ok(())
}

#[tauri::command]
pub fn read_companion_image_asset(
    window: WebviewWindow,
    app: AppHandle,
    scope: State<'_, CompanionAssetScope>,
    id: String,
    mime_type: String,
) -> Result<Response, String> {
    if window.label() != "companion" {
        return Err("WINDOW_CAPABILITY_DENIED:该命令仅供桌面伙伴读取已授权显示素材".into());
    }
    if !scope
        .0
        .lock()
        .map_err(|_| "COMPANION_ASSET_SCOPE_LOCKED:伙伴素材清单暂不可用")?
        .contains(&id)
    {
        return Err("COMPANION_ASSET_DENIED:素材不在当前伙伴角色包中".into());
    }
    AssetRepository::from_app(&app)?
        .read(&id, &mime_type, false)
        .map(Response::new)
}

#[tauri::command]
pub fn health_check(window: WebviewWindow, app: AppHandle) -> Result<HealthStatus, String> {
    require_main(&window)?;
    let path = storage_root(&app)?.join("yiyu.sqlite");

    Ok(HealthStatus {
        runtime: "tauri",
        storage: "ready",
        library_path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn get_storage_status(window: WebviewWindow, app: AppHandle) -> Result<StorageStatus, String> {
    require_main(&window)?;
    storage_status(&app)
}

#[tauri::command]
pub fn configure_storage(
    window: WebviewWindow,
    app: AppHandle,
    directory: String,
) -> Result<StorageStatus, String> {
    require_main(&window)?;
    configure_storage_root(&app, &directory)
}

#[tauri::command]
pub fn create_diagnostic_bundle(window: WebviewWindow, app: AppHandle) -> Result<String, String> {
    require_main(&window)?;
    DiagnosticRepository::from_app(&app)?.create(&app)
}

#[tauri::command]
pub fn load_library(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<Option<LibrarySnapshot>, String> {
    require_main(&window)?;
    LibraryService::new(app)?.load()
}

#[tauri::command]
pub fn save_library(
    window: WebviewWindow,
    app: AppHandle,
    data: Value,
    expected_revision: i64,
) -> Result<SaveReceipt, String> {
    require_main(&window)?;
    LibraryService::new(app)?.save(&data, expected_revision)
}

#[tauri::command]
pub fn save_recovery_draft(
    window: WebviewWindow,
    app: AppHandle,
    draft: RecoveryDraft,
) -> Result<(), String> {
    require_main(&window)?;
    RecoveryRepository::from_app(&app)?.save(&draft)
}

#[tauri::command]
pub fn load_recovery_drafts(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<Vec<RecoveryDraft>, String> {
    require_main(&window)?;
    RecoveryRepository::from_app(&app)?.load_all()
}

#[tauri::command]
pub fn clear_recovery_draft(
    window: WebviewWindow,
    app: AppHandle,
    chapter_id: String,
) -> Result<(), String> {
    require_main(&window)?;
    RecoveryRepository::from_app(&app)?.clear(&chapter_id)
}

#[tauri::command]
pub fn search_library(
    window: WebviewWindow,
    app: AppHandle,
    query: String,
) -> Result<Vec<SearchHit>, String> {
    require_main(&window)?;
    LibraryRepository::from_app(&app)?.search(&query)
}

#[tauri::command]
pub fn import_image_asset(
    window: WebviewWindow,
    app: AppHandle,
    file_name: String,
    mime_type: String,
    bytes: Vec<u8>,
    thumbnail: Vec<u8>,
) -> Result<AssetReceipt, String> {
    require_main(&window)?;
    AssetRepository::from_app(&app)?.import_image(&file_name, &mime_type, &bytes, &thumbnail)
}

#[tauri::command]
pub fn import_companion_video_asset(
    window: WebviewWindow,
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<AssetReceipt, String> {
    require_main(&window)?;
    let encoded_name = request
        .headers()
        .get("x-yiyu-file-name")
        .ok_or_else(|| "VIDEO_NAME_INVALID:缺少视频文件名".to_string())?
        .to_str()
        .map_err(|_| "VIDEO_NAME_INVALID:视频文件名无效")?;
    let file_name = String::from_utf8(
        STANDARD
            .decode(encoded_name)
            .map_err(|_| "VIDEO_NAME_INVALID:视频文件名无法解码")?,
    )
    .map_err(|_| "VIDEO_NAME_INVALID:视频文件名不是 UTF-8")?;
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes.as_slice(),
        InvokeBody::Json(_) => return Err("VIDEO_BODY_INVALID:视频必须使用二进制方式上传".into()),
    };
    AssetRepository::from_app(&app)?.import_video(&file_name, "video/webm", bytes)
}

#[tauri::command]
pub fn read_image_asset(
    window: WebviewWindow,
    app: AppHandle,
    id: String,
    mime_type: String,
    thumbnail: bool,
) -> Result<Vec<u8>, String> {
    require_main(&window)?;
    AssetRepository::from_app(&app)?.read(&id, &mime_type, thumbnail)
}

#[tauri::command]
pub fn delete_image_asset(
    window: WebviewWindow,
    app: AppHandle,
    id: String,
    mime_type: String,
) -> Result<(), String> {
    require_main(&window)?;
    AssetRepository::from_app(&app)?.delete(&id, &mime_type)
}

#[tauri::command]
pub fn import_audio_track(
    window: WebviewWindow,
    app: AppHandle,
    file_name: String,
    mime_type: String,
    bytes: Vec<u8>,
) -> Result<AudioReceipt, String> {
    require_main(&window)?;
    AudioRepository::from_app(&app)?.import(&file_name, &mime_type, &bytes)
}
#[tauri::command]
pub fn read_audio_track(
    window: WebviewWindow,
    app: AppHandle,
    id: String,
    mime_type: String,
) -> Result<Vec<u8>, String> {
    require_main(&window)?;
    AudioRepository::from_app(&app)?.read(&id, &mime_type)
}
#[tauri::command]
pub fn delete_audio_track(
    window: WebviewWindow,
    app: AppHandle,
    id: String,
    mime_type: String,
) -> Result<(), String> {
    require_main(&window)?;
    AudioRepository::from_app(&app)?.delete(&id, &mime_type)
}

#[tauri::command]
pub fn store_secret(
    window: WebviewWindow,
    app: AppHandle,
    id: String,
    secret: String,
) -> Result<(), String> {
    require_main(&window)?;
    SecretRepository::from_app(&app)?.store(&id, &secret)
}
#[tauri::command]
pub fn has_secret(window: WebviewWindow, app: AppHandle, id: String) -> Result<bool, String> {
    require_main(&window)?;
    SecretRepository::from_app(&app)?.has(&id)
}
#[tauri::command]
pub fn delete_secret(window: WebviewWindow, app: AppHandle, id: String) -> Result<(), String> {
    require_main(&window)?;
    SecretRepository::from_app(&app)?.delete(&id)
}

#[tauri::command]
pub async fn companion_chat_completion(
    window: WebviewWindow,
    app: AppHandle,
    endpoint: String,
    model: String,
    messages: Value,
    tools: Value,
) -> Result<Value, String> {
    require_main(&window)?;
    let base = reqwest::Url::parse(&endpoint)
        .map_err(|_| "MODEL_ENDPOINT_INVALID:DeepSeek 服务地址无效")?;
    if base.scheme() != "https" || base.host_str() != Some("api.deepseek.com") {
        return Err("MODEL_ENDPOINT_DENIED:当前联网对话仅允许 api.deepseek.com".into());
    }
    if !matches!(
        base.path(),
        "" | "/" | "/v1" | "/chat/completions" | "/v1/chat/completions"
    ) || base.query().is_some()
        || base.fragment().is_some()
    {
        return Err("MODEL_ENDPOINT_INVALID:DeepSeek 服务路径无效".into());
    }
    if model.trim().is_empty() {
        return Err("MODEL_INVALID:模型 ID 不能为空".into());
    }
    let message_count = messages.as_array().map_or(0, Vec::len);
    if message_count == 0 || message_count > 80 {
        return Err("MODEL_MESSAGES_INVALID:消息数量无效".into());
    }
    if messages.to_string().len() > 256_000 || tools.to_string().len() > 64_000 {
        return Err("MODEL_PAYLOAD_TOO_LARGE:模型请求内容过大".into());
    }
    let api_key = SecretRepository::from_app(&app)?
        .load("companion-provider")?
        .ok_or_else(|| "MODEL_KEY_MISSING:请先在 AI 伙伴设置中保存 DeepSeek API Key".to_string())?;
    let url = if endpoint.trim_end_matches('/').ends_with("/chat/completions") {
        endpoint.trim_end_matches('/').to_string()
    } else {
        format!("{}/chat/completions", endpoint.trim_end_matches('/'))
    };
    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "thinking": { "type": "disabled" }
    });
    if tools.as_array().is_some_and(|items| !items.is_empty()) {
        body["tools"] = tools;
    }
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| format!("MODEL_CLIENT_ERROR:{error}"))?
        .post(url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("MODEL_NETWORK_ERROR:{error}"))?;
    let status = response.status();
    let value = response
        .json::<Value>()
        .await
        .map_err(|error| format!("MODEL_RESPONSE_INVALID:{error}"))?;
    if !status.is_success() {
        let message = value
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("模型服务返回错误");
        return Err(format!(
            "MODEL_HTTP_ERROR:{}:{}",
            status.as_u16(),
            message.chars().take(240).collect::<String>()
        ));
    }
    Ok(value)
}

fn send_model_stream_line(line: &[u8], on_event: &Channel<Value>) -> Result<bool, String> {
    let line = line.strip_suffix(b"\r").unwrap_or(line);
    let Some(data) = line.strip_prefix(b"data:") else {
        return Ok(false);
    };
    let data = data.strip_prefix(b" ").unwrap_or(data);
    if data == b"[DONE]" {
        on_event
            .send(serde_json::json!({ "done": true }))
            .map_err(|error| format!("MODEL_STREAM_CHANNEL_ERROR:{error}"))?;
        return Ok(true);
    }
    if data.is_empty() {
        return Ok(false);
    }
    let value = serde_json::from_slice::<Value>(data)
        .map_err(|error| format!("MODEL_STREAM_INVALID:{error}"))?;
    on_event
        .send(value)
        .map_err(|error| format!("MODEL_STREAM_CHANNEL_ERROR:{error}"))?;
    Ok(false)
}

#[tauri::command]
pub async fn companion_chat_completion_stream(
    window: WebviewWindow,
    app: AppHandle,
    endpoint: String,
    model: String,
    messages: Value,
    tools: Value,
    on_event: Channel<Value>,
) -> Result<(), String> {
    require_main(&window)?;
    let base = reqwest::Url::parse(&endpoint)
        .map_err(|_| "MODEL_ENDPOINT_INVALID:DeepSeek 服务地址无效")?;
    if base.scheme() != "https" || base.host_str() != Some("api.deepseek.com") {
        return Err("MODEL_ENDPOINT_DENIED:当前联网对话仅允许 api.deepseek.com".into());
    }
    if !matches!(
        base.path(),
        "" | "/" | "/v1" | "/chat/completions" | "/v1/chat/completions"
    ) || base.query().is_some()
        || base.fragment().is_some()
    {
        return Err("MODEL_ENDPOINT_INVALID:DeepSeek 服务路径无效".into());
    }
    if model.trim().is_empty() {
        return Err("MODEL_INVALID:模型 ID 不能为空".into());
    }
    let message_count = messages.as_array().map_or(0, Vec::len);
    if message_count == 0 || message_count > 80 {
        return Err("MODEL_MESSAGES_INVALID:消息数量无效".into());
    }
    if messages.to_string().len() > 256_000 || tools.to_string().len() > 64_000 {
        return Err("MODEL_PAYLOAD_TOO_LARGE:模型请求内容过大".into());
    }
    let api_key = SecretRepository::from_app(&app)?
        .load("companion-provider")?
        .ok_or_else(|| "MODEL_KEY_MISSING:请先在 AI 伙伴设置中保存 DeepSeek API Key".to_string())?;
    let url = if endpoint.trim_end_matches('/').ends_with("/chat/completions") {
        endpoint.trim_end_matches('/').to_string()
    } else {
        format!("{}/chat/completions", endpoint.trim_end_matches('/'))
    };
    // The desktop companion prioritizes low-latency streaming. Explicitly disable
    // DeepSeek thinking mode so tool continuations do not require storing and
    // replaying private reasoning_content across conversation turns.
    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "thinking": { "type": "disabled" }
    });
    if tools.as_array().is_some_and(|items| !items.is_empty()) {
        body["tools"] = tools;
    }
    let mut response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|error| format!("MODEL_CLIENT_ERROR:{error}"))?
        .post(url)
        .bearer_auth(api_key)
        .header(reqwest::header::ACCEPT, "text/event-stream")
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("MODEL_NETWORK_ERROR:{error}"))?;
    let status = response.status();
    if !status.is_success() {
        let value = response
            .json::<Value>()
            .await
            .map_err(|error| format!("MODEL_RESPONSE_INVALID:{error}"))?;
        let message = value
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("模型服务返回错误");
        return Err(format!(
            "MODEL_HTTP_ERROR:{}:{}",
            status.as_u16(),
            message.chars().take(240).collect::<String>()
        ));
    }
    let mut buffer = Vec::<u8>::new();
    let mut done = false;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("MODEL_STREAM_ERROR:{error}"))?
    {
        buffer.extend_from_slice(&chunk);
        while let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
            let mut line = buffer.drain(..=position).collect::<Vec<_>>();
            line.pop();
            if send_model_stream_line(&line, &on_event)? {
                done = true;
                break;
            }
        }
        if done {
            break;
        }
    }
    if !done && !buffer.is_empty() {
        done = send_model_stream_line(&buffer, &on_event)?;
    }
    if !done {
        on_event
            .send(serde_json::json!({ "done": true }))
            .map_err(|error| format!("MODEL_STREAM_CHANNEL_ERROR:{error}"))?;
    }
    Ok(())
}

fn validate_voice_identifier(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 100
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
    {
        return Err(format!("VOICE_CONFIG_INVALID:{label} 格式无效"));
    }
    Ok(())
}

fn voice_error(status: reqwest::StatusCode, bytes: &[u8]) -> String {
    let detail = serde_json::from_slice::<Value>(bytes)
        .ok()
        .and_then(|value| {
            value
                .pointer("/detail/message")
                .or_else(|| value.pointer("/detail"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .or_else(|| {
            let text = String::from_utf8_lossy(bytes);
            let text = text.trim();
            (!text.is_empty() && !text.starts_with('<')).then(|| text.to_string())
        })
        .unwrap_or_else(|| status.canonical_reason().unwrap_or("语音服务返回错误").to_string());
    format!(
        "VOICE_HTTP_ERROR:{}:{}",
        status.as_u16(),
        detail.chars().take(240).collect::<String>()
    )
}

#[tauri::command]
pub async fn elevenlabs_realtime_scribe_token(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<String, String> {
    require_main(&window)?;
    let api_key = SecretRepository::from_app(&app)?
        .load("companion-voice-elevenlabs")?
        .ok_or_else(|| "VOICE_KEY_MISSING:请先保存 ElevenLabs API Key".to_string())?;
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| format!("VOICE_CLIENT_ERROR:{error}"))?
        .post("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe")
        .header("xi-api-key", api_key)
        .header(reqwest::header::CONTENT_LENGTH, 0)
        .body(Vec::new())
        .send()
        .await
        .map_err(|error| format!("VOICE_NETWORK_ERROR:{error}"))?;
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("VOICE_RESPONSE_INVALID:{error}"))?;
    if !status.is_success() {
        return Err(voice_error(status, &bytes));
    }
    serde_json::from_slice::<Value>(&bytes)
        .ok()
        .and_then(|value| value.get("token").and_then(Value::as_str).map(str::to_owned))
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "VOICE_RESPONSE_INVALID:ElevenLabs 未返回实时转写凭证".to_string())
}

#[tauri::command]
pub async fn elevenlabs_text_to_speech(
    window: WebviewWindow,
    app: AppHandle,
    text: String,
    model: String,
    voice: String,
) -> Result<Vec<u8>, String> {
    require_main(&window)?;
    let text = text.trim();
    if text.is_empty() || text.chars().count() > 5_000 {
        return Err("VOICE_TEXT_INVALID:朗读文本不能为空且最多 5000 字".into());
    }
    validate_voice_identifier(model.trim(), "模型 ID")?;
    validate_voice_identifier(voice.trim(), "Voice ID")?;
    let api_key = SecretRepository::from_app(&app)?
        .load("companion-voice-elevenlabs")?
        .ok_or_else(|| "VOICE_KEY_MISSING:请先在 AI 伙伴设置中保存 ElevenLabs API Key".to_string())?;
    let url = format!(
        "https://api.elevenlabs.io/v1/text-to-speech/{}?output_format=mp3_44100_128",
        voice.trim()
    );
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| format!("VOICE_CLIENT_ERROR:{error}"))?
        .post(url)
        .header("xi-api-key", api_key)
        .json(&serde_json::json!({ "text": text, "model_id": model.trim() }))
        .send()
        .await
        .map_err(|error| format!("VOICE_NETWORK_ERROR:{error}"))?;
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("VOICE_RESPONSE_INVALID:{error}"))?;
    if !status.is_success() {
        return Err(voice_error(status, &bytes));
    }
    Ok(bytes.to_vec())
}

#[tauri::command]
pub async fn elevenlabs_speech_to_text(
    window: WebviewWindow,
    app: AppHandle,
    audio: Vec<u8>,
    mime_type: String,
    model: String,
) -> Result<String, String> {
    require_main(&window)?;
    if audio.len() < 128 || audio.len() > 25 * 1024 * 1024 {
        return Err("VOICE_AUDIO_INVALID:录音为空或超过 25 MB".into());
    }
    validate_voice_identifier(model.trim(), "模型 ID")?;
    let mime = mime_type.split(';').next().unwrap_or("audio/webm");
    if !matches!(mime, "audio/webm" | "audio/mp4" | "audio/mpeg" | "audio/wav" | "audio/ogg") {
        return Err("VOICE_AUDIO_INVALID:不支持当前录音格式".into());
    }
    let extension = match mime {
        "audio/mp4" => "m4a",
        "audio/mpeg" => "mp3",
        "audio/wav" => "wav",
        "audio/ogg" => "ogg",
        _ => "webm",
    };
    let api_key = SecretRepository::from_app(&app)?
        .load("companion-voice-elevenlabs")?
        .ok_or_else(|| "VOICE_KEY_MISSING:请先在 AI 伙伴设置中保存 ElevenLabs API Key".to_string())?;
    let part = reqwest::multipart::Part::bytes(audio)
        .file_name(format!("companion-recording.{extension}"))
        .mime_str(mime)
        .map_err(|error| format!("VOICE_AUDIO_INVALID:{error}"))?;
    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model_id", model.trim().to_string())
        .text("language_code", "zh");
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|error| format!("VOICE_CLIENT_ERROR:{error}"))?
        .post("https://api.elevenlabs.io/v1/speech-to-text")
        .header("xi-api-key", api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|error| format!("VOICE_NETWORK_ERROR:{error}"))?;
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("VOICE_RESPONSE_INVALID:{error}"))?;
    if !status.is_success() {
        return Err(voice_error(status, &bytes));
    }
    let value = serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| format!("VOICE_RESPONSE_INVALID:{error}"))?;
    value
        .get("text")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| "VOICE_RESPONSE_INVALID:语音服务未返回转写文本".into())
}

#[tauri::command]
pub fn create_backup(
    window: WebviewWindow,
    app: AppHandle,
    automatic: bool,
    created_at: String,
    directory: String,
) -> Result<BackupReceipt, String> {
    require_main(&window)?;
    BackupRepository::with_directory(&app, &directory)?.create(
        &LibraryRepository::from_app(&app)?,
        automatic,
        &created_at,
    )
}
#[tauri::command]
pub fn ensure_daily_backup(
    window: WebviewWindow,
    app: AppHandle,
    retention: usize,
    date: String,
    created_at: String,
    directory: String,
) -> Result<Option<BackupReceipt>, String> {
    require_main(&window)?;
    BackupRepository::with_directory(&app, &directory)?.ensure_daily(
        &LibraryRepository::from_app(&app)?,
        retention,
        &date,
        &created_at,
    )
}
#[tauri::command]
pub fn list_backups(
    window: WebviewWindow,
    app: AppHandle,
    directory: String,
) -> Result<Vec<BackupReceipt>, String> {
    require_main(&window)?;
    BackupRepository::with_directory(&app, &directory)?.list()
}
#[tauri::command]
pub fn preview_backup(
    window: WebviewWindow,
    app: AppHandle,
    bytes: Vec<u8>,
) -> Result<BackupPreview, String> {
    require_main(&window)?;
    BackupRepository::from_app(&app)?.preview(&bytes)
}
#[tauri::command]
pub fn restore_backup(
    window: WebviewWindow,
    app: AppHandle,
    bytes: Vec<u8>,
    directory: String,
) -> Result<(), String> {
    require_main(&window)?;
    BackupRepository::with_directory(&app, &directory)?
        .restore(&LibraryRepository::from_app(&app)?, &bytes)
}

#[tauri::command]
pub fn write_export_bundle(
    window: WebviewWindow,
    app: AppHandle,
    name: String,
    files: Vec<ExportFile>,
) -> Result<String, String> {
    require_main(&window)?;
    TransferRepository::from_app(&app)?.write_bundle(&name, files)
}

#[tauri::command]
pub fn create_vault(
    window: WebviewWindow,
    app: AppHandle,
    id: String,
    password: String,
    payload: Value,
    ttl_minutes: u64,
) -> Result<(), String> {
    require_main(&window)?;
    VaultRepository::from_app(&app)?.create(&id, &password, &payload, ttl_minutes)
}
#[tauri::command]
pub fn unlock_vault(
    window: WebviewWindow,
    app: AppHandle,
    id: String,
    password: String,
    ttl_minutes: u64,
) -> Result<Value, String> {
    require_main(&window)?;
    VaultRepository::from_app(&app)?.unlock(&id, &password, ttl_minutes)
}
#[tauri::command]
pub fn save_vault(
    window: WebviewWindow,
    app: AppHandle,
    id: String,
    payload: Value,
    ttl_minutes: u64,
) -> Result<(), String> {
    require_main(&window)?;
    VaultRepository::from_app(&app)?.save(&id, &payload, ttl_minutes)
}
#[tauri::command]
pub fn vault_unlocked(window: WebviewWindow, app: AppHandle, id: String) -> Result<bool, String> {
    require_main(&window)?;
    VaultRepository::from_app(&app)?.is_unlocked(&id)
}
#[tauri::command]
pub fn lock_vault(window: WebviewWindow, app: AppHandle, id: String) -> Result<(), String> {
    require_main(&window)?;
    VaultRepository::from_app(&app)?.lock(&id)
}
#[tauri::command]
pub fn lock_all_vaults(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    require_main(&window)?;
    VaultRepository::from_app(&app)?.lock_all()
}

#[cfg(test)]
mod companion_scope_tests {
    use super::{classify_web_search_error, fetch_web_search, is_allowed_bing_url, parse_web_search, strip_html, valid_asset_id, voice_error, xml_value};

    #[test]
    fn accepts_only_repository_asset_identifiers() {
        assert!(valid_asset_id("asset-1a-2"));
        assert!(!valid_asset_id("../asset-1"));
        assert!(!valid_asset_id("track-1"));
    }

    #[test]
    fn voice_errors_do_not_expose_html_gateway_pages() {
        let error = voice_error(
            reqwest::StatusCode::LENGTH_REQUIRED,
            b"<html><body><h1>Length Required</h1></body></html>",
        );
        assert_eq!(error, "VOICE_HTTP_ERROR:411:Length Required");
    }

    #[test]
    fn parses_search_rss_without_preserving_html_markup() {
        let item = "<item><title>一隅 &amp; 测试</title><link>https://example.com</link><description><![CDATA[<b>摘要</b> 内容]]></description></item>";
        assert_eq!(xml_value(item, "title"), "一隅 & 测试");
        assert_eq!(strip_html(&xml_value(item, "description")), "摘要 内容");
        let results = parse_web_search(&format!("<rss><channel>{item}</channel></rss>"));
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].url, "https://example.com");
    }

    #[test]
    fn search_redirects_stay_on_explicit_bing_hosts() {
        assert!(is_allowed_bing_url(&reqwest::Url::parse("https://www.bing.com/search").unwrap()));
        assert!(is_allowed_bing_url(&reqwest::Url::parse("https://cn.bing.com/search").unwrap()));
        assert!(!is_allowed_bing_url(&reqwest::Url::parse("https://example.com/search").unwrap()));
    }

    #[test]
    fn search_error_codes_do_not_contain_request_urls() {
        let result = tauri::async_runtime::block_on(async {
            reqwest::Client::builder()
                .timeout(std::time::Duration::ZERO)
                .build().unwrap()
                .get("https://www.bing.com/search?q=private")
                .send().await
        }).unwrap_err();
        assert_eq!(classify_web_search_error(&result), "TIMEOUT");
    }

    #[test]
    #[ignore = "requires external network"]
    fn searches_bing_rss_through_the_application_client() {
        let results = tauri::async_runtime::block_on(fetch_web_search("一隅 软件")).unwrap();
        assert!(!results.is_empty());
    }
}
