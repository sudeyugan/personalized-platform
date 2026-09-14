use std::{fs, path::PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

const LOCATION_FILE: &str = "library-location.txt";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatus {
    pub directory: String,
    pub library_exists: bool,
    pub custom: bool,
}

pub fn app_base(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("无法定位应用数据目录：{error}"))
}

pub fn storage_root(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app_base(app)?;
    let pointer = base.join(LOCATION_FILE);
    if !pointer.exists() {
        return Ok(base);
    }
    let raw = fs::read_to_string(pointer).map_err(io_error)?;
    let path = PathBuf::from(raw.trim());
    if !path.is_absolute() {
        return Err("STORAGE_LOCATION:资料库位置配置损坏，必须是绝对路径".into());
    }
    Ok(path)
}

pub fn status(app: &AppHandle) -> Result<StorageStatus, String> {
    let base = app_base(app)?;
    let root = storage_root(app)?;
    Ok(StorageStatus {
        directory: root.to_string_lossy().into_owned(),
        library_exists: root.join("yiyu.sqlite").exists(),
        custom: root != base,
    })
}

pub fn configure(app: &AppHandle, directory: &str) -> Result<StorageStatus, String> {
    let base = app_base(app)?;
    fs::create_dir_all(&base).map_err(io_error)?;
    let target = if directory.trim().is_empty() {
        base.clone()
    } else {
        let path = PathBuf::from(directory.trim());
        if !path.is_absolute() {
            return Err("STORAGE_LOCATION:资料库目录必须是 Windows 绝对路径".into());
        }
        path
    };
    let current = storage_root(app)?;
    if current.join("yiyu.sqlite").exists() && current != target {
        return Err("STORAGE_IN_USE:已有资料库不能在首次向导中直接迁移，请先使用完整备份".into());
    }
    fs::create_dir_all(&target).map_err(io_error)?;
    let probe = target.join(".yiyu-write-probe");
    fs::write(&probe, b"ok")
        .map_err(|error| format!("STORAGE_WRITABLE:资料库目录不可写：{error}"))?;
    fs::remove_file(probe).map_err(io_error)?;
    let pointer = base.join(LOCATION_FILE);
    if target == base {
        if pointer.exists() {
            fs::remove_file(pointer).map_err(io_error)?;
        }
    } else {
        let partial = base.join(format!("{LOCATION_FILE}.partial"));
        fs::write(&partial, target.to_string_lossy().as_bytes()).map_err(io_error)?;
        if pointer.exists() {
            fs::remove_file(&pointer).map_err(io_error)?;
        }
        fs::rename(partial, pointer).map_err(io_error)?;
    }
    status(app)
}

fn io_error(error: std::io::Error) -> String {
    format!("资料库位置文件操作失败：{error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn location_must_be_absolute() {
        assert!(!PathBuf::from("relative/library").is_absolute());
        assert!(tempdir().unwrap().path().is_absolute());
    }
}
