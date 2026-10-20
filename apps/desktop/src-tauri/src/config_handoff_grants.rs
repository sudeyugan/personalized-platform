//! Native approval is not replaceable by WebView state or generic store_secret.
use crate::{
    config_handoff::{FAILURE, context},
    repositories::SecretRepository,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tauri::WebviewWindow;
const GRANTS: &str = "device-config-grants";
fn read(repository: &SecretRepository) -> Result<Value, String> {
    repository
        .raw_load(GRANTS)?
        .map(|raw| serde_json::from_str(&raw).map_err(|_| FAILURE.into()))
        .unwrap_or(Ok(json!({})))
}
fn id(bound: &Value) -> String {
    format!(
        "{}/{}",
        bound[1].as_str().unwrap_or(""),
        bound[2].as_str().unwrap_or("")
    )
}
fn pin(bound: &Value) -> Value {
    json!([bound[1], bound[2], bound[3], bound[4], bound[6], bound[7]])
}
pub(crate) fn check(repository: &SecretRepository, bound: &Value) -> Result<(), String> {
    if read(repository)?[id(bound)]["pin"] == pin(bound) {
        Ok(())
    } else {
        Err("请在已有设备重新批准本次配置交接。".into())
    }
}
pub(crate) fn grant(
    repository: &SecretRepository,
    bound: &Value,
    follow: bool,
) -> Result<(), String> {
    let mut values = read(repository)?;
    if values.as_object().ok_or(FAILURE)?.len() >= 32 && values.get(id(bound)).is_none() {
        return Err(FAILURE.into());
    }
    let mut keys = json!({});
    if !follow {
        for scope in bound[6].as_array().ok_or(FAILURE)? {
            let scope = scope.as_str().ok_or(FAILURE)?;
            let alias = if scope == "model" {
                "companion-provider"
            } else {
                "companion-voice-elevenlabs"
            };
            keys[scope] = json!(repository.load(alias)?.ok_or(FAILURE)?);
        }
    }
    values[id(bound)] = json!({"pin":pin(bound),"follow":follow,"keys":keys});
    repository.raw_store(GRANTS, &values.to_string())
}
pub(crate) fn key(
    repository: &SecretRepository,
    bound: &Value,
    scope: &str,
    alias: &str,
) -> Result<String, String> {
    check(repository, bound)?;
    let value = &read(repository)?[id(bound)];
    if value["follow"] == true {
        repository.load(alias)?.ok_or(FAILURE.into())
    } else {
        value["keys"][scope]
            .as_str()
            .map(str::to_owned)
            .ok_or(FAILURE.into())
    }
}
pub(crate) fn revoke(repository: &SecretRepository, text: &str) -> Result<(), String> {
    let bound = context(text)?;
    let mut values = read(repository)?;
    values.as_object_mut().ok_or(FAILURE)?.remove(&id(&bound));
    repository.raw_store(GRANTS, &values.to_string())
}
pub(crate) fn clear(repository: &SecretRepository) -> Result<(), String> {
    repository.raw_store(GRANTS, "{}")
}
pub(crate) fn authorize(
    window: &WebviewWindow,
    repository: &SecretRepository,
    input: &Value,
) -> Result<Value, String> {
    let text = input["context"].as_str().ok_or(FAILURE)?;
    let bound = context(text)?;
    let raw = input["request"].as_str().ok_or(FAILURE)?;
    if raw.len() > 3000 {
        return Err(FAILURE.into());
    }
    let request: Value = serde_json::from_str(raw).map_err(|_| FAILURE)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| FAILURE)?
        .as_millis() as u64;
    if request["space"] != bound[1]
        || request["id"] != bound[2]
        || request["target"] != bound[4]
        || request["scopes"] != bound[6]
        || request["publicKey"] != bound[7]
        || !request["expires"]
            .as_u64()
            .is_some_and(|expires| expires >= now && expires <= now + 610000)
    {
        return Err(FAILURE.into());
    }
    if check(repository, &bound).is_ok() {
        return Ok(json!(true));
    }
    let digest = Sha256::digest(format!("[\"yiyu-config-v1\",\"request\",{raw}]").as_bytes());
    let code = digest[..6]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let code = format!("{} · {} · {}", &code[..4], &code[4..8], &code[8..]);
    let name = request["name"]
        .as_str()
        .unwrap_or("另一台设备")
        .chars()
        .filter(|c| {
            !c.is_control() && !matches!(*c,'\u{202a}'..='\u{202e}'|'\u{2066}'..='\u{2069}')
        })
        .take(60)
        .collect::<String>();
    let scopes = bound[6]
        .as_array()
        .ok_or(FAILURE)?
        .iter()
        .map(|scope| {
            if scope == "model" {
                "DeepSeek对话"
            } else {
                "ElevenLabs语音"
            }
        })
        .collect::<Vec<_>>()
        .join("、");
    let message = format!(
        "请与新设备核对校验码：\n\n{code}\n\n设备：{name}\n范围：{scopes}\n\n将交接所选服务的 API Key。{}\n共用同一账户额度；不授予系统或浏览器权限。\n\n仅在校验码相同时批准。",
        if request["follow"] == true {
            "包含以后更新，可在设置停止。"
        } else {
            "仅本次复制。"
        }
    );
    if !confirm(window, &message)? {
        return Err("已取消，未授权交接。".into());
    }
    if std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| FAILURE)?
        .as_millis() as u64
        > request["expires"].as_u64().ok_or(FAILURE)?
    {
        return Err("请求已经过期，请在新设备重新申请。".into());
    }
    grant(
        repository,
        &bound,
        request["follow"].as_bool().ok_or(FAILURE)?,
    )?;
    Ok(json!(true))
}
#[cfg(windows)]
fn confirm(window: &WebviewWindow, message: &str) -> Result<bool, String> {
    use windows::{
        Win32::UI::WindowsAndMessaging::{IDOK, MB_ICONWARNING, MB_OKCANCEL, MessageBoxW},
        core::PCWSTR,
    };
    let owner = window.hwnd().map_err(|_| FAILURE)?;
    let text = message.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    let title = "一隅 · 批准配置交接"
        .encode_utf16()
        .chain(Some(0))
        .collect::<Vec<_>>();
    Ok(unsafe {
        MessageBoxW(
            Some(owner),
            PCWSTR(text.as_ptr()),
            PCWSTR(title.as_ptr()),
            MB_OKCANCEL | MB_ICONWARNING,
        )
    } == IDOK)
}
#[cfg(not(windows))]
fn confirm(_: &WebviewWindow, _: &str) -> Result<bool, String> {
    Err(FAILURE.into())
}
