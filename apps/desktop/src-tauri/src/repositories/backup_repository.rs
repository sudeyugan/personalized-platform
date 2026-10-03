use std::{fs, io::{Read, Write}, path::{Path, PathBuf}};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};
use super::{LibraryRepository, storage_root, validate_library};
#[path = "backup_archive.rs"] mod archive;
#[path = "backup_shared.rs"] mod shared;
#[path = "backup_restore.rs"] mod restore;
use archive::*;
use shared::SNAPSHOT_EXTENSION;
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupReceipt {
    pub path: String,
    pub created_at: String,
    pub size: u64,
    pub sha256: String,
    pub automatic: bool,
    pub shared: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreview {
    pub app_version: String,
    pub created_at: String,
    pub works: usize,
    pub chapters: usize,
    pub assets: usize,
    pub encrypted_vaults: usize,
    pub checksums_valid: bool,
}

pub struct BackupRepository {
    root: PathBuf,
    app_data: PathBuf,
}


impl BackupRepository {
    pub fn from_app(app: &AppHandle) -> Result<Self, String> {
        let app_data = storage_root(app)?;
        Ok(Self {
            root: app_data.join("backups"),
            app_data,
        })
    }
    pub fn with_directory(app: &AppHandle, directory: &str) -> Result<Self, String> {
        let mut repository = Self::from_app(app)?;
        if !directory.trim().is_empty() {
            let path = PathBuf::from(directory.trim());
            if !path.is_absolute() {
                return Err("BACKUP_DIRECTORY:备份目录必须是绝对路径".into());
            }
            repository.root = path;
        }
        Ok(repository)
    }


    pub fn create(&self, library: &LibraryRepository, automatic: bool, created_at: &str) -> Result<BackupReceipt, String> {
        self.write_archive(library, automatic, created_at, None)
    }
    pub(super) fn write_archive(&self, library: &LibraryRepository, automatic: bool, created_at: &str, local_date: Option<&str>) -> Result<BackupReceipt, String> {
        if !safe_timestamp(created_at) || local_date.is_some_and(|date| !safe_date(date)) { return Err("BACKUP_DATE:备份时间格式不合法".into()); }
        let data = library.load()?.ok_or("BACKUP_EMPTY:资料库尚无可备份内容")?.data;
        self.prepare_root()?;
        let shared = local_date.is_some();
        let safe_time = created_at.replace([':', '.'], "-");
        let name = match local_date {
            Some(date) => format!("一隅-自动-{date}-{safe_time}.{SNAPSHOT_EXTENSION}"),
            None => format!("一隅-{}-{safe_time}.yiyu-backup", if automatic { "自动" } else { "手动" }),
        };
        let path = self.root.join(name);
        let partial = path.with_extension("partial");
        if path.exists() { return Err("BACKUP_EXISTS:同名备份已存在，未覆盖".into()); }
        let file = fs::OpenOptions::new().create_new(true).write(true).open(&partial).map_err(io_error)?;
        let result = (|| {
            let mut zip = ZipWriter::new(file);
            let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
            let mut checksums = Vec::new();
            add_entry(&mut zip, "library.json", &serde_json::to_vec(&data).map_err(|e| e.to_string())?, options, &mut checksums)?;
            let mut manifest = json!({
                "format":"yiyu-backup", "formatVersion":if shared {2} else {1},
                "appVersion":env!("CARGO_PKG_VERSION"), "databaseSchemaVersion":5,
                "createdAt":created_at, "automatic":automatic, "localDate":local_date,
                "counts":{"works":data.get("works").and_then(Value::as_array).map_or(0, Vec::len),
                    "chapters":data.get("chapters").and_then(Value::as_object).map_or(0, serde_json::Map::len),
                    "assets":data.get("assets").and_then(Value::as_array).map_or(0, Vec::len)},
                "encryptedVaults":data.get("works").and_then(Value::as_array).map_or(0, |works| works.iter().filter(|w| w.get("encrypted").and_then(Value::as_bool).unwrap_or(false)).count()),
                "includesHistory":true
            });
            if shared {
                manifest["files"] = serde_json::to_value(self.collect_shared()?).map_err(|e| e.to_string())?;
                shared::references(&manifest)?;
            } else {
                for name in ["assets", "vaults", "audio"] { add_directory(&mut zip, &self.app_data.join(name), name, options, &mut checksums)?; }
            }
            add_entry(&mut zip, "manifest.json", &serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?, options, &mut checksums)?;
            zip.start_file("checksums.sha256", options).map_err(zip_error)?;
            zip.write_all(checksums.join("\n").as_bytes()).map_err(io_error)?;
            zip.finish().map_err(zip_error)?.sync_all().map_err(io_error)?;
            let (_, valid) = inspect_reader(fs::File::open(&partial).map_err(io_error)?)?;
            if !valid { return Err("BACKUP_CHECKSUM:新建备份校验失败，未发布".into()); }
            fs::rename(&partial, &path).map_err(io_error)?;
            receipt(&path, created_at.to_string(), automatic)
        })();
        if result.is_err() { let _ = fs::remove_file(&partial); }
        result
    }

    pub fn list(&self) -> Result<Vec<BackupReceipt>, String> {
        if !self.root.exists() { return Ok(Vec::new()); }
        let mut items = Vec::new();
        for entry in fs::read_dir(&self.root).map_err(io_error)? {
            let entry = entry.map_err(io_error)?;
            let path = entry.path();
            if !matches!(path.extension().and_then(|s| s.to_str()), Some("yiyu-backup" | SNAPSHOT_EXTENSION)) { continue; }
            shared::no_link(&path)?;
            let file = fs::File::open(&path).map_err(io_error)?;
            let size = file.metadata().map_err(io_error)?.len();
            if size > MAX_ARCHIVE_BYTES as u64 { continue; }
            let mut archive = match ZipArchive::new(file) { Ok(archive) => archive, Err(_) => continue };
            let mut raw = String::new();
            let Ok(manifest_file) = archive.by_name("manifest.json") else { continue };
            if manifest_file.take(8 * 1024 * 1024 + 1).read_to_string(&mut raw).is_err() || raw.len() > 8 * 1024 * 1024 { continue; }
            let Ok(manifest) = serde_json::from_str::<Value>(&raw) else { continue };
            if manifest["format"] != "yiyu-backup" { continue; }
            let automatic = entry.file_name().to_string_lossy().starts_with("一隅-自动-") && manifest["automatic"].as_bool().unwrap_or(true);
            items.push(BackupReceipt { path: path.to_string_lossy().into_owned(), created_at: text(&manifest, "createdAt"),
                size, sha256: String::new(), automatic, shared: path.extension().and_then(|s| s.to_str()) == Some(SNAPSHOT_EXTENSION) });
        }
        items.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.path.cmp(&a.path)));
        Ok(items)
    }

    pub fn ensure_automatic(&self, library: &LibraryRepository, retention: usize, interval_days: usize, date: &str, created_at: &str) -> Result<Option<BackupReceipt>, String> {
        self.prepare_root()?;
        let today = date_day(date).ok_or("BACKUP_DATE:本地日期格式不合法")?;
        for item in self.list()?.into_iter().filter(|item| item.automatic && item.shared) {
            let name = Path::new(&item.path).file_name().and_then(|s| s.to_str()).unwrap_or("");
            let Some(day) = name.strip_prefix("一隅-自动-").and_then(|s| s.get(..10)).and_then(date_day) else { continue };
            if today - day < interval_days.clamp(1, 30) as i64 {
                let (_, valid) = inspect_reader(fs::File::open(&item.path).map_err(io_error)?)?;
                if !valid { return Err("BACKUP_CHECKSUM:最近自动快照损坏，请检查备份目录".into()); }
                return Ok(None);
            }
        }
        let created = self.write_archive(library, true, created_at, Some(date))?;
        self.check_shared(&inspect_reader(fs::File::open(&created.path).map_err(io_error)?)?.0)?;
        self.prune_automatic(retention, &created.path)?;
        Ok(Some(created))
    }
    pub fn preview(&self, bytes: &[u8]) -> Result<BackupPreview, String> {
        let (manifest, valid) = inspect(bytes)?;
        if manifest["formatVersion"] == 2 { return Err("BACKUP_SHARED:自动快照需要共享素材，请从备份记录恢复或复制整个备份目录".into()); }
        Ok(preview_manifest(&manifest, valid))
    }
    pub(super) fn saved_path(&self, path: &str) -> Result<PathBuf, String> {
        let path = PathBuf::from(path);
        shared::no_link(&path)?;
        let path = path.canonicalize().map_err(io_error)?;
        let root = self.root.canonicalize().map_err(io_error)?;
        if path.parent() != Some(root.as_path()) || !matches!(path.extension().and_then(|s| s.to_str()), Some("yiyu-backup" | SNAPSHOT_EXTENSION)) {
            return Err("BACKUP_PATH:只能读取当前备份目录内的备份文件".into());
        }
        Ok(path)
    }
    pub fn preview_saved(&self, path: &str) -> Result<BackupPreview, String> {
        let (manifest, valid) = inspect_reader(fs::File::open(self.saved_path(path)?).map_err(io_error)?)?;
        if manifest["formatVersion"] == 2 { self.check_shared(&manifest)?; }
        Ok(preview_manifest(&manifest, valid))
    }
}
fn preview_manifest(manifest: &Value, valid: bool) -> BackupPreview {
    BackupPreview { app_version: text(manifest, "appVersion"), created_at: text(manifest, "createdAt"),
        works: count(manifest, "works"), chapters: count(manifest, "chapters"), assets: count(manifest, "assets"),
        encrypted_vaults: manifest["encryptedVaults"].as_u64().unwrap_or(0) as usize, checksums_valid: valid }
}
fn add_directory(zip: &mut ZipWriter<fs::File>, root: &Path, prefix: &str, options: SimpleFileOptions, checksums: &mut Vec<String>) -> Result<(), String> {
    if !root.exists() { return Ok(()); }
    shared::no_link(root)?;
    for entry in fs::read_dir(root).map_err(io_error)? {
        let entry = entry.map_err(io_error)?;
        let path = entry.path();
        shared::no_link(&path)?;
        let name = format!("{prefix}/{}", entry.file_name().to_string_lossy());
        if path.is_dir() { add_directory(zip, &path, &name, options, checksums)?; }
        else {
            let mut input = fs::File::open(path).map_err(io_error)?;
            if input.metadata().map_err(io_error)?.len() > MAX_ENTRY_BYTES { return Err("BACKUP_ENTRY_SIZE:素材文件过大".into()); }
            zip.start_file(&name, options).map_err(zip_error)?;
            let mut hash = Sha256::new();
            let mut buffer = [0_u8; 64 * 1024];
            loop {
                let length = input.read(&mut buffer).map_err(io_error)?;
                if length == 0 { break; }
                zip.write_all(&buffer[..length]).map_err(io_error)?;
                hash.update(&buffer[..length]);
            }
            checksums.push(format!("{:X}  {name}", hash.finalize()));
        }
    }
    Ok(())
}
fn add_entry(
    zip: &mut ZipWriter<fs::File>,
    name: &str,
    bytes: &[u8],
    options: SimpleFileOptions,
    checksums: &mut Vec<String>,
) -> Result<(), String> {
    zip.start_file(name, options).map_err(zip_error)?;
    zip.write_all(bytes).map_err(io_error)?;
    checksums.push(format!("{:X}  {name}", Sha256::digest(bytes)));
    Ok(())
}

#[cfg(test)]
#[path = "backup_tests.rs"] mod tests;
