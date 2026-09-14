use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::{Value, json};
use tauri::{AppHandle, Manager};
use zip::{CompressionMethod, ZipWriter, write::SimpleFileOptions};

use super::storage_root::app_base;
use super::{LibraryRepository, storage_root};

pub struct DiagnosticRepository {
    root: PathBuf,
}

impl DiagnosticRepository {
    pub fn from_app(app: &AppHandle) -> Result<Self, String> {
        let root = app
            .path()
            .document_dir()
            .or_else(|_| app.path().app_data_dir())
            .map_err(|error| format!("无法定位诊断包目录：{error}"))?
            .join("一隅诊断");
        Ok(Self { root })
    }

    pub fn create(&self, app: &AppHandle) -> Result<String, String> {
        fs::create_dir_all(&self.root).map_err(io_error)?;
        let stamp = epoch_millis()?;
        let target = self.root.join(format!("一隅-诊断-{stamp}.zip"));
        let partial = target.with_extension("partial");
        let root = storage_root(app)?;
        let snapshot = LibraryRepository::from_app(app)?.load()?;
        let data = snapshot.as_ref().map(|item| &item.data);
        let diagnostic = json!({
            "format": "yiyu-diagnostic",
            "formatVersion": 1,
            "appVersion": env!("CARGO_PKG_VERSION"),
            "createdAtEpochMs": stamp,
            "platform": { "os": std::env::consts::OS, "arch": std::env::consts::ARCH },
            "storage": { "location": if root == app_base(app)? { "default" } else { "custom" }, "databaseBytes": file_size(&root.join("yiyu.sqlite")), "assets": directory_stats(&root.join("assets")), "vaults": directory_stats(&root.join("vaults")), "recoveryDrafts": directory_stats(&root.join("recovery/drafts")) },
            "library": { "revision": snapshot.as_ref().map_or(0, |item| item.revision), "works": array_count(data, "works"), "chapters": object_count(data, "chapters"), "people": array_count(data, "people"), "places": array_count(data, "places"), "events": array_count(data, "events"), "assets": array_count(data, "assets"), "encryptedWorks": encrypted_count(data) },
            "privacy": { "containsDocumentText": false, "containsTitles": false, "containsApiKeys": false, "pathsRedacted": true },
        });
        let file = fs::File::create(&partial).map_err(io_error)?;
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        zip.start_file("diagnostics.json", options)
            .map_err(zip_error)?;
        zip.write_all(&serde_json::to_vec_pretty(&diagnostic).unwrap())
            .map_err(io_error)?;
        let crash = app_base(app)?.join("diagnostics/last-crash.json");
        if crash.exists() {
            zip.start_file("last-crash.json", options)
                .map_err(zip_error)?;
            zip.write_all(&fs::read(crash).map_err(io_error)?)
                .map_err(io_error)?;
        }
        zip.finish().map_err(zip_error)?;
        fs::rename(partial, &target).map_err(io_error)?;
        Ok(target.to_string_lossy().into_owned())
    }
}

pub fn install_panic_marker(app: &AppHandle) -> Result<(), String> {
    let directory = app_base(app)?.join("diagnostics");
    std::panic::set_hook(Box::new(move |info| {
        let _ = fs::create_dir_all(&directory);
        let location = info.location();
        let marker = json!({ "kind": "panic", "epochMs": epoch_millis().unwrap_or_default(), "module": location.map(|item| Path::new(item.file()).file_name().unwrap_or_default().to_string_lossy().into_owned()), "line": location.map(|item| item.line()) });
        let partial = directory.join("last-crash.partial");
        let target = directory.join("last-crash.json");
        let _ = fs::write(&partial, serde_json::to_vec(&marker).unwrap_or_default());
        let _ = fs::rename(partial, target);
    }));
    Ok(())
}

fn directory_stats(root: &Path) -> Value {
    fn walk(path: &Path, files: &mut u64, bytes: &mut u64) {
        let Ok(entries) = fs::read_dir(path) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, files, bytes)
            } else {
                *files += 1;
                *bytes += file_size(&path)
            }
        }
    }
    let (mut files, mut bytes) = (0, 0);
    walk(root, &mut files, &mut bytes);
    json!({"files":files,"bytes":bytes})
}
fn file_size(path: &Path) -> u64 {
    fs::metadata(path).map_or(0, |item| item.len())
}
fn array_count(data: Option<&Value>, key: &str) -> usize {
    data.and_then(|item| item.get(key))
        .and_then(Value::as_array)
        .map_or(0, Vec::len)
}
fn object_count(data: Option<&Value>, key: &str) -> usize {
    data.and_then(|item| item.get(key))
        .and_then(Value::as_object)
        .map_or(0, serde_json::Map::len)
}
fn encrypted_count(data: Option<&Value>) -> usize {
    data.and_then(|item| item.get("works"))
        .and_then(Value::as_array)
        .map_or(0, |works| {
            works
                .iter()
                .filter(|work| {
                    work.get("encrypted")
                        .and_then(Value::as_bool)
                        .unwrap_or(false)
                })
                .count()
        })
}
fn epoch_millis() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|item| item.as_millis())
        .map_err(|error| format!("系统时间不可用：{error}"))
}
fn io_error(error: std::io::Error) -> String {
    format!("诊断包文件操作失败：{error}")
}
fn zip_error(error: zip::result::ZipError) -> String {
    format!("诊断包压缩失败：{error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    #[test]
    fn path_and_stats_do_not_expose_nested_names() {
        let directory = tempdir().unwrap();
        fs::write(directory.path().join("private-title.txt"), b"secret").unwrap();
        let stats = directory_stats(directory.path());
        assert_eq!(stats["files"], 1);
        assert!(!stats.to_string().contains("private-title"));
    }
}
