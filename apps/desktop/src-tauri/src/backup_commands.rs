use std::sync::Mutex;
use tauri::{AppHandle, WebviewWindow};
use super::require_main;
use crate::repositories::{BackupRepository, BackupReceipt, BackupPreview, LibraryRepository};

// Serialize backup/restore/collection jobs; never block the WebView event loop.
static BACKUP_JOB: Mutex<()> = Mutex::new(());
async fn background<T: Send + 'static>(job: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = BACKUP_JOB.lock().map_err(|_| "BACKUP_LOCK:备份任务锁不可用")?;
        job()
    }).await.map_err(|e| format!("BACKUP_JOB:备份任务异常：{e}"))?
}
#[tauri::command]
pub async fn create_backup(window: WebviewWindow, app: AppHandle, automatic: bool, created_at: String, directory: String) -> Result<BackupReceipt, String> {
    require_main(&window)?;
    background(move || BackupRepository::with_directory(&app, &directory)?.create(&LibraryRepository::from_app(&app)?, automatic, &created_at)).await
}
#[tauri::command]
pub async fn ensure_daily_backup(window: WebviewWindow, app: AppHandle, retention: usize, interval_days: usize, date: String, created_at: String, directory: String) -> Result<Option<BackupReceipt>, String> {
    require_main(&window)?;
    background(move || BackupRepository::with_directory(&app, &directory)?.ensure_automatic(&LibraryRepository::from_app(&app)?, retention, interval_days, &date, &created_at)).await
}
#[tauri::command]
pub async fn list_backups(window: WebviewWindow, app: AppHandle, directory: String) -> Result<Vec<BackupReceipt>, String> {
    require_main(&window)?;
    background(move || BackupRepository::with_directory(&app, &directory)?.list()).await
}
#[tauri::command]
pub async fn preview_backup(window: WebviewWindow, app: AppHandle, bytes: Vec<u8>) -> Result<BackupPreview, String> {
    require_main(&window)?;
    background(move || BackupRepository::from_app(&app)?.preview(&bytes)).await
}
#[tauri::command]
pub async fn restore_backup(window: WebviewWindow, app: AppHandle, bytes: Vec<u8>, directory: String) -> Result<(), String> {
    require_main(&window)?;
    background(move || BackupRepository::with_directory(&app, &directory)?.restore(&LibraryRepository::from_app(&app)?, &bytes)).await
}
#[tauri::command]
pub async fn preview_saved_backup(window: WebviewWindow, app: AppHandle, path: String, directory: String) -> Result<BackupPreview, String> {
    require_main(&window)?;
    background(move || BackupRepository::with_directory(&app, &directory)?.preview_saved(&path)).await
}
#[tauri::command]
pub async fn restore_saved_backup(window: WebviewWindow, app: AppHandle, path: String, directory: String) -> Result<(), String> {
    require_main(&window)?;
    background(move || BackupRepository::with_directory(&app, &directory)?.restore_saved(&LibraryRepository::from_app(&app)?, &path)).await
}
