use std::{collections::HashSet, sync::Mutex};

use serde::Serialize;
use serde_json::Value;
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
) -> Result<Vec<u8>, String> {
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
    AssetRepository::from_app(&app)?.read(&id, &mime_type, false)
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
    use super::valid_asset_id;

    #[test]
    fn accepts_only_repository_asset_identifiers() {
        assert!(valid_asset_id("asset-1a-2"));
        assert!(!valid_asset_id("../asset-1"));
        assert!(!valid_asset_id("track-1"));
    }
}
