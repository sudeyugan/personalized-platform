use std::{
    collections::VecDeque,
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};

use bzip2::read::BzDecoder;
use pinyin::ToPinyin;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sherpa_onnx::{
    KeywordSpotter, KeywordSpotterConfig, OnlineStream, SpeakerEmbeddingExtractor,
    SpeakerEmbeddingExtractorConfig,
};
use tauri::{ipc::Channel, AppHandle, Manager, State, WebviewWindow};

use crate::repositories::SecretRepository;

const SAMPLE_RATE: i32 = 16_000;
const PROFILE_SECRET: &str = "companion-speaker-profile";
const KWS_ARCHIVE_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01-mobile.tar.bz2";
const KWS_ARCHIVE_SHA256: &str = "B812A043AEF628A6915F89CB9A94E55F8E87E89FF904B516F822D7E0A3E6DE2B";
const SPEAKER_MODEL_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx";
const SPEAKER_MODEL_FALLBACK_URL: &str = "https://huggingface.co/csukuangfj/speaker-embedding-models/resolve/main/3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx";
const SPEAKER_MODEL_CHINA_MIRROR_URL: &str = "https://hf-mirror.com/csukuangfj/speaker-embedding-models/resolve/main/3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx";
const SPEAKER_MODEL_SHA256: &str = "F682B514C05D947EE3FA91CD6EC6C5C7543479A128373FA29B1FAEDCCD21FD11";
const KWS_DIRECTORY: &str = "sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01-mobile";
const SPEAKER_MODEL: &str = "3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx";
const MODELSCOPE_KWS_ROOT: &str = "https://www.modelscope.cn/models/pkufool/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01/resolve/master";
const KWS_FALLBACK_FILES: [(&str, &str, usize); 4] = [
    (
        "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
        "017AF32F2C0138F931D05FBC009EE864295E910AFF304F77D2F563815FC834FB",
        6 * 1024 * 1024,
    ),
    (
        "decoder-epoch-12-avg-2-chunk-16-left-64.onnx",
        "BB3D8640CC6A495088707173BC1707A8A4FFE014594FC9ADCBA8389E27D0339F",
        1024 * 1024,
    ),
    (
        "joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
        "431DE10B554F134EF8AF320FEEA2DB337E641290449A3D3F6CB6E5F5FD2C9C3D",
        512 * 1024,
    ),
    (
        "tokens.txt",
        "72316508D9119696145ABC6F1F8CDC46287535C34E5CE7E595F845CB1499CF2E",
        16 * 1024,
    ),
];

#[derive(Default)]
pub struct LocalVoiceState {
    engine: Mutex<Option<LocalWakeEngine>>,
    download_active: AtomicBool,
    download_cancelled: AtomicBool,
}

struct ActiveDownloadGuard<'a>(&'a AtomicBool);

impl Drop for ActiveDownloadGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

struct LocalWakeEngine {
    spotter: KeywordSpotter,
    stream: OnlineStream,
    speaker: Option<SpeakerEmbeddingExtractor>,
    enrolled: Vec<Vec<f32>>,
    ring: VecDeque<f32>,
    speaker_threshold: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalVoiceStatus {
    models_installed: bool,
    speaker_enrolled: bool,
    model_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalVoiceDetection {
    detected: bool,
    speaker_matched: bool,
    speaker_score: Option<f32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalVoiceDownloadProgress {
    phase: String,
    label: String,
    source: String,
    file_index: usize,
    file_count: usize,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    percent: Option<u8>,
}

#[derive(Deserialize, Serialize)]
struct StoredSpeakerProfile {
    version: u8,
    embeddings: Vec<Vec<f32>>,
}

fn require_voice_window(window: &WebviewWindow) -> Result<(), String> {
    if matches!(window.label(), "main" | "companion-chat") {
        Ok(())
    } else {
        Err("VOICE_WINDOW_DENIED:当前窗口不能访问本地语音能力".into())
    }
}

fn model_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("VOICE_MODEL_PATH:无法定位本地语音模型目录：{error}"))?
        .join("local-voice")
        .join("models"))
}

fn kws_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(model_root(app)?.join(KWS_DIRECTORY))
}

fn required_paths(app: &AppHandle) -> Result<[PathBuf; 5], String> {
    let kws = kws_root(app)?;
    Ok([
        kws.join("encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
        kws.join("decoder-epoch-12-avg-2-chunk-16-left-64.onnx"),
        kws.join("joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
        kws.join("tokens.txt"),
        model_root(app)?.join(SPEAKER_MODEL),
    ])
}

fn models_installed(app: &AppHandle) -> Result<bool, String> {
    Ok(required_paths(app)?.iter().all(|path| path.is_file()))
}

fn hash_hex(bytes: &[u8]) -> String {
    format!("{:X}", Sha256::digest(bytes))
}

async fn download_verified(
    client: &reqwest::Client,
    url: &str,
    expected_sha256: &str,
    max_bytes: usize,
    label: &str,
    file_index: usize,
    file_count: usize,
    on_progress: &Channel<LocalVoiceDownloadProgress>,
    cancelled: &AtomicBool,
) -> Result<Vec<u8>, String> {
    if cancelled.load(Ordering::Acquire) {
        return Err("VOICE_MODEL_CANCELLED:模型下载已取消".into());
    }
    let source = reqwest::Url::parse(url)
        .ok()
        .and_then(|value| value.host_str().map(str::to_owned))
        .unwrap_or_else(|| "下载源".into());
    let _ = on_progress.send(LocalVoiceDownloadProgress {
        phase: "connecting".into(),
        label: label.into(),
        source: source.clone(),
        file_index,
        file_count,
        downloaded_bytes: 0,
        total_bytes: None,
        percent: None,
    });
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("{error}"))?
        .error_for_status()
        .map_err(|error| format!("{error}"))?;
    if response.content_length().is_some_and(|size| size as usize > max_bytes) {
        return Err("模型文件超过预期大小".into());
    }
    let total_bytes = response.content_length();
    let mut bytes = Vec::with_capacity(total_bytes.unwrap_or(0).min(max_bytes as u64) as usize);
    let mut last_reported_bytes = 0_u64;
    let mut last_reported_percent = None;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("无法读取模型响应：{error}"))?
    {
        if cancelled.load(Ordering::Acquire) {
            return Err("VOICE_MODEL_CANCELLED:模型下载已取消".into());
        }
        if bytes.len().saturating_add(chunk.len()) > max_bytes {
            return Err("模型文件超过预期大小".into());
        }
        bytes.extend_from_slice(&chunk);
        let downloaded_bytes = bytes.len() as u64;
        let percent = total_bytes
            .filter(|total| *total > 0)
            .map(|total| ((downloaded_bytes.saturating_mul(100) / total).min(100)) as u8);
        if percent != last_reported_percent
            || downloaded_bytes.saturating_sub(last_reported_bytes) >= 256 * 1024
        {
            let _ = on_progress.send(LocalVoiceDownloadProgress {
                phase: "downloading".into(),
                label: label.into(),
                source: source.clone(),
                file_index,
                file_count,
                downloaded_bytes,
                total_bytes,
                percent,
            });
            last_reported_bytes = downloaded_bytes;
            last_reported_percent = percent;
        }
    }
    let _ = on_progress.send(LocalVoiceDownloadProgress {
        phase: "verifying".into(),
        label: label.into(),
        source,
        file_index,
        file_count,
        downloaded_bytes: bytes.len() as u64,
        total_bytes,
        percent: Some(100),
    });
    if hash_hex(&bytes) != expected_sha256 {
        return Err("模型校验失败，文件不会被使用".into());
    }
    Ok(bytes)
}

async fn download_verified_from_any(
    label: &str,
    urls: &[String],
    expected_sha256: &str,
    max_bytes: usize,
    file_index: usize,
    file_count: usize,
    on_progress: &Channel<LocalVoiceDownloadProgress>,
    cancelled: &AtomicBool,
) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Yiyu/2.0 local-voice-model-installer")
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|error| format!("VOICE_MODEL_DOWNLOAD:无法初始化下载器：{error}"))?;
    let mut failures = Vec::new();
    for url in urls {
        for attempt in 1..=2 {
            if cancelled.load(Ordering::Acquire) {
                return Err("VOICE_MODEL_CANCELLED:模型下载已取消".into());
            }
            match download_verified(
                &client,
                url,
                expected_sha256,
                max_bytes,
                label,
                file_index,
                file_count,
                on_progress,
                cancelled,
            )
            .await
            {
                Ok(bytes) => return Ok(bytes),
                Err(error) => {
                    if error.starts_with("VOICE_MODEL_CANCELLED:") {
                        return Err(error);
                    }
                    failures.push(format!("{url}（第 {attempt} 次）：{error}"));
                    let _ = on_progress.send(LocalVoiceDownloadProgress {
                        phase: if attempt < 2 { "retrying" } else { "switching" }.into(),
                        label: label.into(),
                        source: reqwest::Url::parse(url)
                            .ok()
                            .and_then(|value| value.host_str().map(str::to_owned))
                            .unwrap_or_else(|| "下载源".into()),
                        file_index,
                        file_count,
                        downloaded_bytes: 0,
                        total_bytes: None,
                        percent: None,
                    });
                }
            }
        }
    }
    Err(format!(
        "VOICE_MODEL_DOWNLOAD:{label}下载失败。已尝试官方源和备用源，请检查网络或代理后重试。详情：{}",
        failures.join("；")
    ))
}

async fn install_kws_models(
    root: &Path,
    source: &str,
    on_progress: &Channel<LocalVoiceDownloadProgress>,
    cancelled: &AtomicBool,
) -> Result<bool, String> {
    async fn install_archive(
        root: &Path,
        on_progress: &Channel<LocalVoiceDownloadProgress>,
        cancelled: &AtomicBool,
    ) -> Result<(), String> {
        let archive_urls = [KWS_ARCHIVE_URL.to_string()];
        let kws_archive = download_verified_from_any(
            "关键词模型",
            &archive_urls,
            KWS_ARCHIVE_SHA256,
            18 * 1024 * 1024,
            1,
            2,
            on_progress,
            cancelled,
        )
        .await?;
        let decoder = BzDecoder::new(Cursor::new(kws_archive));
        let mut archive = tar::Archive::new(decoder);
        for entry in archive
            .entries()
            .map_err(|error| format!("VOICE_MODEL_ARCHIVE:无法读取模型包：{error}"))?
        {
            let mut entry = entry
                .map_err(|error| format!("VOICE_MODEL_ARCHIVE:模型包条目损坏：{error}"))?;
            entry
                .unpack_in(root)
                .map_err(|error| format!("VOICE_MODEL_ARCHIVE:无法解压模型：{error}"))?;
        }
        Ok(())
    }

    async fn install_modelscope(
        root: &Path,
        on_progress: &Channel<LocalVoiceDownloadProgress>,
        cancelled: &AtomicBool,
    ) -> Result<(), String> {
        let kws = root.join(KWS_DIRECTORY);
        for (index, (name, sha256, max_bytes)) in KWS_FALLBACK_FILES.into_iter().enumerate() {
            let urls = [format!("{MODELSCOPE_KWS_ROOT}/{name}")];
            let bytes = download_verified_from_any(
                &format!("关键词模型文件 {name}"),
                &urls,
                sha256,
                max_bytes,
                index + 1,
                5,
                on_progress,
                cancelled,
            )
            .await?;
            write_atomic(&kws.join(name), &bytes)?;
        }
        Ok(())
    }

    match source {
        "global" => {
            install_archive(root, on_progress, cancelled).await?;
            Ok(false)
        }
        "china" => {
            install_modelscope(root, on_progress, cancelled).await?;
            Ok(true)
        }
        _ => match install_modelscope(root, on_progress, cancelled).await {
            Ok(()) => Ok(true),
            Err(error) if error.starts_with("VOICE_MODEL_CANCELLED:") => Err(error),
            Err(_) => {
                install_archive(root, on_progress, cancelled).await?;
                Ok(false)
            }
        },
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("VOICE_MODEL_PATH:模型路径无效")?;
    fs::create_dir_all(parent).map_err(|error| format!("VOICE_MODEL_WRITE:无法创建模型目录：{error}"))?;
    let partial = path.with_extension("partial");
    fs::write(&partial, bytes).map_err(|error| format!("VOICE_MODEL_WRITE:无法写入模型：{error}"))?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("VOICE_MODEL_WRITE:无法替换旧模型：{error}"))?;
    }
    fs::rename(partial, path).map_err(|error| format!("VOICE_MODEL_WRITE:无法完成模型写入：{error}"))
}

#[tauri::command]
pub fn local_voice_status(window: WebviewWindow, app: AppHandle) -> Result<LocalVoiceStatus, String> {
    require_voice_window(&window)?;
    let paths = required_paths(&app)?;
    let model_bytes = paths
        .iter()
        .filter_map(|path| fs::metadata(path).ok().map(|item| item.len()))
        .sum();
    Ok(LocalVoiceStatus {
        models_installed: paths.iter().all(|path| path.is_file()),
        speaker_enrolled: SecretRepository::from_app(&app)?.has(PROFILE_SECRET)?,
        model_bytes,
    })
}

#[tauri::command]
pub async fn local_voice_install_models(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, LocalVoiceState>,
    source: String,
    on_progress: Channel<LocalVoiceDownloadProgress>,
) -> Result<LocalVoiceStatus, String> {
    require_voice_window(&window)?;
    if !matches!(source.as_str(), "china" | "auto" | "global") {
        return Err("VOICE_MODEL_SOURCE:下载源设置无效".into());
    }
    state
        .download_active
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| "VOICE_MODEL_BUSY:已有模型下载任务正在进行".to_string())?;
    let _guard = ActiveDownloadGuard(&state.download_active);
    state.download_cancelled.store(false, Ordering::Release);
    if !models_installed(&app)? {
        let root = model_root(&app)?;
        fs::create_dir_all(&root).map_err(|error| format!("VOICE_MODEL_WRITE:无法创建模型目录：{error}"))?;
        let used_kws_fallback = install_kws_models(
            &root,
            &source,
            &on_progress,
            &state.download_cancelled,
        )
        .await?;
        let speaker_urls = match source.as_str() {
            "china" => vec![SPEAKER_MODEL_CHINA_MIRROR_URL.to_string()],
            "global" => vec![
                SPEAKER_MODEL_URL.to_string(),
                SPEAKER_MODEL_FALLBACK_URL.to_string(),
            ],
            _ => vec![
                SPEAKER_MODEL_CHINA_MIRROR_URL.to_string(),
                SPEAKER_MODEL_FALLBACK_URL.to_string(),
                SPEAKER_MODEL_URL.to_string(),
            ],
        };
        let speaker = download_verified_from_any(
            "声纹模型",
            &speaker_urls,
            SPEAKER_MODEL_SHA256,
            32 * 1024 * 1024,
            if used_kws_fallback { 5 } else { 2 },
            if used_kws_fallback { 5 } else { 2 },
            &on_progress,
            &state.download_cancelled,
        )
        .await?;
        write_atomic(&root.join(SPEAKER_MODEL), &speaker)?;
        if !models_installed(&app)? {
            return Err("VOICE_MODEL_INCOMPLETE:模型安装后仍缺少必要文件".into());
        }
    }
    let _ = on_progress.send(LocalVoiceDownloadProgress {
        phase: "complete".into(),
        label: "本地语音模型".into(),
        source: "本机".into(),
        file_index: 1,
        file_count: 1,
        downloaded_bytes: 1,
        total_bytes: Some(1),
        percent: Some(100),
    });
    local_voice_status(window, app)
}

#[tauri::command]
pub fn local_voice_cancel_install(
    window: WebviewWindow,
    state: State<LocalVoiceState>,
) -> Result<bool, String> {
    require_voice_window(&window)?;
    let active = state.download_active.load(Ordering::Acquire);
    if active {
        state.download_cancelled.store(true, Ordering::Release);
    }
    Ok(active)
}

fn create_speaker_extractor(app: &AppHandle) -> Result<SpeakerEmbeddingExtractor, String> {
    let config = SpeakerEmbeddingExtractorConfig {
        model: Some(model_root(app)?.join(SPEAKER_MODEL).to_string_lossy().into_owned()),
        num_threads: 1,
        debug: false,
        provider: Some("cpu".into()),
    };
    SpeakerEmbeddingExtractor::create(&config).ok_or_else(|| "VOICE_SPEAKER_INIT:无法加载本地声纹模型".into())
}

fn embedding(extractor: &SpeakerEmbeddingExtractor, samples: &[f32]) -> Result<Vec<f32>, String> {
    if samples.len() < SAMPLE_RATE as usize * 2 {
        return Err("VOICE_SAMPLE_SHORT:每段录音至少需要两秒有效声音".into());
    }
    let stream = extractor.create_stream().ok_or("VOICE_SPEAKER_STREAM:无法创建声纹流")?;
    stream.accept_waveform(SAMPLE_RATE, samples);
    stream.input_finished();
    if !extractor.is_ready(&stream) {
        return Err("VOICE_SAMPLE_SHORT:录音过短或声音不清晰".into());
    }
    extractor.compute(&stream).ok_or_else(|| "VOICE_SPEAKER_COMPUTE:无法生成声纹".into())
}

#[tauri::command]
pub fn local_voice_enroll(window: WebviewWindow, app: AppHandle, samples: Vec<Vec<f32>>) -> Result<LocalVoiceStatus, String> {
    require_voice_window(&window)?;
    if !models_installed(&app)? {
        return Err("VOICE_MODEL_MISSING:请先下载本地语音模型".into());
    }
    if !(3..=5).contains(&samples.len()) {
        return Err("VOICE_ENROLL_COUNT:请录制三到五段声音".into());
    }
    let extractor = create_speaker_extractor(&app)?;
    let embeddings = samples
        .iter()
        .map(|sample| embedding(&extractor, sample))
        .collect::<Result<Vec<_>, _>>()?;
    let value = serde_json::to_string(&StoredSpeakerProfile { version: 1, embeddings })
        .map_err(|error| format!("VOICE_PROFILE_ENCODING:无法编码声纹：{error}"))?;
    SecretRepository::from_app(&app)?.store(PROFILE_SECRET, &value)?;
    local_voice_status(window, app)
}

#[tauri::command]
pub fn local_voice_delete_profile(window: WebviewWindow, app: AppHandle, state: State<LocalVoiceState>) -> Result<LocalVoiceStatus, String> {
    require_voice_window(&window)?;
    SecretRepository::from_app(&app)?.delete(PROFILE_SECRET)?;
    *state.engine.lock().map_err(|_| "VOICE_STATE:本地语音状态不可用")? = None;
    local_voice_status(window, app)
}

fn split_pinyin(value: &str) -> String {
    let initials = ["zh", "ch", "sh"];
    if let Some(initial) = initials.iter().find(|initial| value.starts_with(**initial)) {
        return format!("{} {}", initial, &value[initial.len()..]);
    }
    if value.as_bytes().first().is_some_and(|value| matches!(*value as char, 'b'|'p'|'m'|'f'|'d'|'t'|'n'|'l'|'g'|'k'|'h'|'j'|'q'|'x'|'z'|'c'|'s'|'r'|'y'|'w')) {
        return format!("{} {}", &value[..1], &value[1..]);
    }
    value.to_owned()
}

fn keyword_spec(wake_word: &str) -> Result<String, String> {
    let trimmed = wake_word.trim();
    let count = trimmed.chars().count();
    if !(2..=6).contains(&count) || !trimmed.chars().all(|character| ('\u{4e00}'..='\u{9fff}').contains(&character)) {
        return Err("VOICE_WAKE_WORD:唤醒词应为二到六个汉字".into());
    }
    let tokens = trimmed
        .chars()
        .map(|character| character.to_pinyin().map(|value| split_pinyin(value.with_tone())))
        .collect::<Option<Vec<_>>>()
        .ok_or("VOICE_WAKE_WORD:唤醒词中有无法转换为拼音的汉字")?
        .join(" ");
    Ok(format!("{tokens} @{trimmed}"))
}

fn load_profile(app: &AppHandle) -> Result<Vec<Vec<f32>>, String> {
    let value = SecretRepository::from_app(app)?
        .load(PROFILE_SECRET)?
        .ok_or("VOICE_PROFILE_MISSING:请先录入声纹")?;
    let profile: StoredSpeakerProfile = serde_json::from_str(&value)
        .map_err(|_| "VOICE_PROFILE_INVALID:本地声纹资料已损坏")?;
    if profile.version != 1 || profile.embeddings.is_empty() {
        return Err("VOICE_PROFILE_INVALID:本地声纹资料已损坏".into());
    }
    Ok(profile.embeddings)
}

#[tauri::command]
pub fn local_voice_start(window: WebviewWindow, app: AppHandle, state: State<LocalVoiceState>, wake_word: String, sensitivity: String, speaker_required: bool) -> Result<(), String> {
    require_voice_window(&window)?;
    if !models_installed(&app)? {
        return Err("VOICE_MODEL_MISSING:请先下载本地语音模型".into());
    }
    let paths = required_paths(&app)?;
    let mut config = KeywordSpotterConfig::default();
    config.model_config.transducer.encoder = Some(paths[0].to_string_lossy().into_owned());
    config.model_config.transducer.decoder = Some(paths[1].to_string_lossy().into_owned());
    config.model_config.transducer.joiner = Some(paths[2].to_string_lossy().into_owned());
    config.model_config.tokens = Some(paths[3].to_string_lossy().into_owned());
    config.model_config.provider = Some("cpu".into());
    config.model_config.num_threads = 1;
    config.keywords_buf = Some(keyword_spec(&wake_word)?);
    config.keywords_score = match sensitivity.as_str() { "high" => 2.5, "low" => 1.2, _ => 1.8 };
    config.keywords_threshold = match sensitivity.as_str() { "high" => 0.12, "low" => 0.34, _ => 0.22 };
    let spotter = KeywordSpotter::create(&config).ok_or("VOICE_WAKE_INIT:无法加载本地唤醒模型")?;
    let stream = spotter.create_stream();
    let enrolled = if speaker_required { load_profile(&app)? } else { Vec::new() };
    let speaker = if speaker_required { Some(create_speaker_extractor(&app)?) } else { None };
    *state.engine.lock().map_err(|_| "VOICE_STATE:本地语音状态不可用")? = Some(LocalWakeEngine {
        spotter,
        stream,
        speaker,
        enrolled,
        ring: VecDeque::with_capacity(SAMPLE_RATE as usize * 4),
        speaker_threshold: 0.55,
    });
    Ok(())
}

fn cosine(left: &[f32], right: &[f32]) -> f32 {
    if left.len() != right.len() || left.is_empty() { return 0.0; }
    let dot = left.iter().zip(right).map(|(a, b)| a * b).sum::<f32>();
    let a = left.iter().map(|value| value * value).sum::<f32>().sqrt();
    let b = right.iter().map(|value| value * value).sum::<f32>().sqrt();
    if a == 0.0 || b == 0.0 { 0.0 } else { dot / (a * b) }
}

#[tauri::command]
pub fn local_voice_process_pcm(window: WebviewWindow, state: State<LocalVoiceState>, samples: Vec<f32>) -> Result<LocalVoiceDetection, String> {
    require_voice_window(&window)?;
    if samples.is_empty() || samples.len() > SAMPLE_RATE as usize * 2 || samples.iter().any(|value| !value.is_finite()) {
        return Err("VOICE_PCM_INVALID:麦克风音频分块无效".into());
    }
    let mut guard = state.engine.lock().map_err(|_| "VOICE_STATE:本地语音状态不可用")?;
    let engine = guard.as_mut().ok_or("VOICE_NOT_STARTED:本地唤醒尚未启动")?;
    engine.stream.accept_waveform(SAMPLE_RATE, &samples);
    engine.ring.extend(samples);
    while engine.ring.len() > SAMPLE_RATE as usize * 4 { engine.ring.pop_front(); }
    while engine.spotter.is_ready(&engine.stream) {
        engine.spotter.decode(&engine.stream);
        if engine.spotter.get_result(&engine.stream).is_some_and(|result| !result.keyword.is_empty()) {
            engine.spotter.reset(&engine.stream);
            let audio = engine.ring.iter().copied().collect::<Vec<_>>();
            engine.ring.clear();
            if let Some(extractor) = &engine.speaker {
                let query = embedding(extractor, &audio)?;
                let score = engine.enrolled.iter().map(|item| cosine(item, &query)).fold(0.0f32, f32::max);
                return Ok(LocalVoiceDetection { detected: true, speaker_matched: score >= engine.speaker_threshold, speaker_score: Some(score) });
            }
            return Ok(LocalVoiceDetection { detected: true, speaker_matched: true, speaker_score: None });
        }
    }
    Ok(LocalVoiceDetection { detected: false, speaker_matched: false, speaker_score: None })
}

#[tauri::command]
pub fn local_voice_stop(window: WebviewWindow, state: State<LocalVoiceState>) -> Result<(), String> {
    require_voice_window(&window)?;
    *state.engine.lock().map_err(|_| "VOICE_STATE:本地语音状态不可用")? = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        cosine, keyword_spec, split_pinyin, KWS_ARCHIVE_SHA256, KWS_FALLBACK_FILES,
        SPEAKER_MODEL_SHA256,
    };

    fn is_sha256(value: &str) -> bool {
        value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
    }

    #[test]
    fn bundled_model_checksums_are_valid_sha256_values() {
        assert!(is_sha256(KWS_ARCHIVE_SHA256));
        assert!(is_sha256(SPEAKER_MODEL_SHA256));
        for (_, checksum, _) in KWS_FALLBACK_FILES {
            assert!(is_sha256(checksum));
        }
    }

    #[test]
    fn creates_wenetspeech_keyword_tokens_for_chinese_wake_words() {
        let value = keyword_spec("小鱼").unwrap();
        assert!(value.ends_with("@小鱼"));
        assert!(value.contains("x iǎo"));
        assert!(value.contains("y ú"));
        assert_eq!(split_pinyin("zhōu"), "zh ōu");
    }

    #[test]
    fn rejects_unsafe_or_too_short_wake_words() {
        assert!(keyword_spec("鱼").is_err());
        assert!(keyword_spec("hello").is_err());
    }

    #[test]
    fn compares_normalized_speaker_embeddings() {
        assert!((cosine(&[1.0, 0.0], &[2.0, 0.0]) - 1.0).abs() < 0.001);
        assert_eq!(cosine(&[1.0, 0.0], &[0.0, 1.0]), 0.0);
    }
}
