use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use super::{
    policy::target_allowed,
    types::{ComputerPolicy, ComputerRuntime, ManagedChild, ManagedStatus},
};

const CREATE_NO_WINDOW: u32 = 0x08000000;

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
}

pub fn detect_ffmpeg(policy: Option<&ComputerPolicy>) -> Option<PathBuf> {
    if let Some(path) = policy.map(|item| item.ffmpeg_path.trim()).filter(|value| !value.is_empty()) {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    let candidates = [
        r"D:\ffmpeg-9.0.2-essentials_build\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe",
        r"D:\ffmpeg\bin\ffmpeg.exe",
        r"C:\ffmpeg\bin\ffmpeg.exe",
    ];
    for candidate in candidates {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Some(path);
        }
    }
    let output = Command::new("where.exe").arg("ffmpeg.exe").creation_flags(CREATE_NO_WINDOW).output().ok()?;
    let first = String::from_utf8_lossy(&output.stdout).lines().next()?.trim().to_string();
    let path = PathBuf::from(first);
    path.is_file().then_some(path)
}

fn default_directory(policy: &ComputerPolicy) -> Result<PathBuf, String> {
    if !policy.recording_directory.trim().is_empty() {
        return Ok(PathBuf::from(policy.recording_directory.trim()));
    }
    let home = std::env::var_os("USERPROFILE").ok_or_else(|| "RECORDING_HOME_MISSING".to_string())?;
    Ok(PathBuf::from(home).join("Videos").join("一隅录制"))
}

fn output_path(policy: &ComputerPolicy, supplied: Option<&str>, extension: &str, confirmed: bool) -> Result<PathBuf, String> {
    let directory = default_directory(policy)?;
    let path = match supplied.filter(|value| !value.trim().is_empty()) {
        Some(value) => {
            let target = PathBuf::from(value.trim());
            if !target.is_absolute() {
                return Err("RECORDING_PATH_INVALID:输出必须使用绝对路径".into());
            }
            if !target.starts_with(&directory) && !confirmed && !target_allowed(policy, "file_write", &target.to_string_lossy()) {
                return Err("RECORDING_PATH_DENIED:自定义输出路径需要文件写入授权或本次确认".into());
            }
            target
        }
        None => directory.join(format!("yiyu-{}.{}", now_ms(), extension)),
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("RECORDING_CREATE_DIR:{error}"))?;
    }
    Ok(path)
}

fn input_name(source: &str) -> Result<String, String> {
    if source == "desktop" {
        return Ok("desktop".into());
    }
    if let Some(title) = source.strip_prefix("window:").map(str::trim).filter(|value| !value.is_empty()) {
        return Ok(format!("title={title}"));
    }
    Err("SCREEN_SOURCE_INVALID:请使用 desktop 或 window:窗口标题".into())
}

fn base_command(ffmpeg: &Path) -> Command {
    let mut command = Command::new(ffmpeg);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

pub fn capture(policy: &ComputerPolicy, source: &str, supplied: Option<&str>, confirmed: bool) -> Result<Value, String> {
    let ffmpeg = detect_ffmpeg(Some(policy)).ok_or_else(|| "FFMPEG_NOT_FOUND:请在设置中选择 FFmpeg".to_string())?;
    let output = output_path(policy, supplied, "png", confirmed)?;
    let result = base_command(&ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-f", "gdigrab", "-framerate", "1", "-i"])
        .arg(input_name(source)?)
        .args(["-frames:v", "1", "-y"])
        .arg(&output)
        .output()
        .map_err(|error| format!("SCREEN_CAPTURE_START:{error}"))?;
    if !result.status.success() {
        return Err(format!("SCREEN_CAPTURE_FAILED:{}", String::from_utf8_lossy(&result.stderr)));
    }
    Ok(json!({ "path": output.to_string_lossy() }))
}

pub fn start(
    runtime: &ComputerRuntime,
    policy: &ComputerPolicy,
    source: &str,
    supplied: Option<&str>,
    fps: u32,
    audio_device: Option<&str>,
    confirmed: bool,
) -> Result<Value, String> {
    let ffmpeg = detect_ffmpeg(Some(policy)).ok_or_else(|| "FFMPEG_NOT_FOUND:请在设置中选择 FFmpeg".to_string())?;
    let output = output_path(policy, supplied, "mp4", confirmed)?;
    let has_audio = audio_device.is_some_and(|value| !value.trim().is_empty());
    let mut command = base_command(&ffmpeg);
    command
        .args(["-hide_banner", "-loglevel", "warning", "-f", "gdigrab", "-framerate"])
        .arg(fps.clamp(5, 60).to_string())
        .arg("-i")
        .arg(input_name(source)?);
    if let Some(device) = audio_device.filter(|value| !value.trim().is_empty()) {
        command.args(["-f", "dshow", "-i"]).arg(format!("audio={device}"));
    }
    command.args(["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"]);
    if has_audio {
        command.args(["-c:a", "aac", "-shortest"]);
    }
    command.arg("-y").arg(&output).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null());
    let child = command.spawn().map_err(|error| format!("SCREEN_RECORD_START:{error}"))?;
    let id = format!("recording-{}-{}", now_ms(), child.id());
    let status = ManagedStatus {
        id: id.clone(),
        kind: "screen_recording".into(),
        label: source.into(),
        output_path: Some(output.to_string_lossy().into_owned()),
        started_at_ms: now_ms(),
    };
    runtime.recordings.lock().map_err(|_| "RECORDING_STATE_LOCK".to_string())?.insert(id.clone(), ManagedChild { child, status });
    Ok(json!({ "recordingId": id, "path": output.to_string_lossy() }))
}

pub fn stop(runtime: &ComputerRuntime, id: &str) -> Result<Value, String> {
    let mut managed = runtime.recordings.lock().map_err(|_| "RECORDING_STATE_LOCK".to_string())?
        .remove(id)
        .ok_or_else(|| format!("RECORDING_NOT_FOUND:{id}"))?;
    if let Some(stdin) = managed.child.stdin.as_mut() {
        let _ = stdin.write_all(b"q\n");
        let _ = stdin.flush();
    }
    let output_path = managed.status.output_path.clone();
    for _ in 0..30 {
        if managed.child.try_wait().map_err(|error| format!("RECORDING_WAIT:{error}"))?.is_some() {
            return Ok(json!({ "recordingId": id, "path": output_path, "stopped": true }));
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    let _ = managed.child.kill();
    let _ = managed.child.wait();
    Ok(json!({ "recordingId": id, "path": output_path, "stopped": true, "forced": true }))
}