//! Verified, bounded model downloads; no audio or profile access.
use super::*;
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

pub(super) async fn download_verified_from_any(
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

pub(super) async fn install_kws_models(
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

pub(super) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("VOICE_MODEL_PATH:模型路径无效")?;
    fs::create_dir_all(parent).map_err(|error| format!("VOICE_MODEL_WRITE:无法创建模型目录：{error}"))?;
    let partial = path.with_extension("partial");
    fs::write(&partial, bytes).map_err(|error| format!("VOICE_MODEL_WRITE:无法写入模型：{error}"))?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("VOICE_MODEL_WRITE:无法替换旧模型：{error}"))?;
    }
    fs::rename(partial, path).map_err(|error| format!("VOICE_MODEL_WRITE:无法完成模型写入：{error}"))
}
