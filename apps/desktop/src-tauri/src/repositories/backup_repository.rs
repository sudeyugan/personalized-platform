use std::{
    collections::HashSet,
    fs,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
};

use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

use super::{LibraryRepository, storage_root};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupReceipt {
    pub path: String,
    pub created_at: String,
    pub size: u64,
    pub sha256: String,
    pub automatic: bool,
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

    pub fn create(
        &self,
        library: &LibraryRepository,
        automatic: bool,
        created_at: &str,
    ) -> Result<BackupReceipt, String> {
        let snapshot = library.load()?.ok_or("BACKUP_EMPTY:资料库尚无可备份内容")?;
        fs::create_dir_all(&self.root).map_err(io_error)?;
        if !safe_timestamp(created_at) {
            return Err("BACKUP_DATE:备份时间格式不合法".into());
        }
        let created_at = created_at.to_string();
        let safe_time = created_at.replace([':', '.'], "-");
        let path = self.root.join(format!(
            "一隅-{}-{safe_time}.yiyu-backup",
            if automatic { "自动" } else { "手动" }
        ));
        let partial = path.with_extension("partial");
        let file = fs::File::create(&partial).map_err(io_error)?;
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        let data = snapshot.data;
        let mut checksums = Vec::new();
        let library_bytes =
            serde_json::to_vec(&data).map_err(|error| format!("无法序列化备份：{error}"))?;
        add_entry(
            &mut zip,
            "library.json",
            &library_bytes,
            options,
            &mut checksums,
        )?;
        add_directory(
            &mut zip,
            &self.app_data.join("assets"),
            "assets",
            options,
            &mut checksums,
        )?;
        add_directory(
            &mut zip,
            &self.app_data.join("vaults"),
            "vaults",
            options,
            &mut checksums,
        )?;
        add_directory(
            &mut zip,
            &self.app_data.join("audio"),
            "audio",
            options,
            &mut checksums,
        )?;
        let manifest = json!({"format":"yiyu-backup","formatVersion":1,"appVersion":env!("CARGO_PKG_VERSION"),"databaseSchemaVersion":5,"createdAt":created_at,"counts":{"works":data.get("works").and_then(Value::as_array).map_or(0, Vec::len),"chapters":data.get("chapters").and_then(Value::as_object).map_or(0, serde_json::Map::len),"assets":data.get("assets").and_then(Value::as_array).map_or(0, Vec::len)},"encryptedVaults":data.get("works").and_then(Value::as_array).map_or(0, |works| works.iter().filter(|work| work.get("encrypted").and_then(Value::as_bool).unwrap_or(false)).count()),"includesHistory":true});
        add_entry(
            &mut zip,
            "manifest.json",
            &serde_json::to_vec_pretty(&manifest).unwrap(),
            options,
            &mut checksums,
        )?;
        zip.start_file("checksums.sha256", options)
            .map_err(zip_error)?;
        zip.write_all(checksums.join("\n").as_bytes())
            .map_err(io_error)?;
        zip.finish().map_err(zip_error)?;
        fs::rename(&partial, &path).map_err(io_error)?;
        receipt(&path, created_at, automatic)
    }

    pub fn list(&self) -> Result<Vec<BackupReceipt>, String> {
        if !self.root.exists() {
            return Ok(Vec::new());
        }
        let mut items = fs::read_dir(&self.root)
            .map_err(io_error)?
            .filter_map(Result::ok)
            .filter(|entry| {
                entry.path().extension().and_then(|value| value.to_str()) == Some("yiyu-backup")
            })
            .filter_map(|entry| {
                receipt(
                    &entry.path(),
                    entry.file_name().to_string_lossy().into_owned(),
                    entry.file_name().to_string_lossy().contains("自动"),
                )
                .ok()
            })
            .collect::<Vec<_>>();
        items.sort_by(|a, b| b.path.cmp(&a.path));
        Ok(items)
    }

    pub fn ensure_daily(
        &self,
        library: &LibraryRepository,
        retention: usize,
        date: &str,
        created_at: &str,
    ) -> Result<Option<BackupReceipt>, String> {
        fs::create_dir_all(&self.root).map_err(io_error)?;
        if !safe_date(date) {
            return Err("BACKUP_DATE:本地日期格式不合法".into());
        }
        let today = date.to_string();
        if fs::read_dir(&self.root)
            .map_err(io_error)?
            .filter_map(Result::ok)
            .any(|entry| {
                entry.file_name().to_string_lossy().contains("自动")
                    && entry.file_name().to_string_lossy().contains(&today)
            })
        {
            return Ok(None);
        }
        let created = self.create(library, true, created_at)?;
        let mut automatic = self
            .list()?
            .into_iter()
            .filter(|item| item.automatic)
            .collect::<Vec<_>>();
        automatic.sort_by(|a, b| b.path.cmp(&a.path));
        for stale in automatic.into_iter().skip(retention.max(1)) {
            let _ = fs::remove_file(stale.path);
        }
        Ok(Some(created))
    }

    pub fn preview(&self, bytes: &[u8]) -> Result<BackupPreview, String> {
        let (manifest, valid) = inspect(bytes)?;
        Ok(BackupPreview {
            app_version: text(&manifest, "appVersion"),
            created_at: text(&manifest, "createdAt"),
            works: count(&manifest, "works"),
            chapters: count(&manifest, "chapters"),
            assets: count(&manifest, "assets"),
            encrypted_vaults: manifest
                .get("encryptedVaults")
                .and_then(Value::as_u64)
                .unwrap_or(0) as usize,
            checksums_valid: valid,
        })
    }

    pub fn restore(&self, library: &LibraryRepository, bytes: &[u8]) -> Result<(), String> {
        let (_, valid) = inspect(bytes)?;
        if !valid {
            return Err("BACKUP_CHECKSUM:备份校验失败，未修改当前资料库".into());
        }
        let old = library.load()?.ok_or("RESTORE_EMPTY:当前资料库不可用")?;
        let safety_stamp = format!(
            "pre-restore-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|error| format!("BACKUP_CLOCK:系统时间不可用：{error}"))?
                .as_millis()
        );
        let _safety = self.create(library, false, &safety_stamp)?;
        let staging = self.app_data.join("restore-staging");
        if staging.exists() {
            fs::remove_dir_all(&staging).map_err(io_error)?;
        }
        fs::create_dir_all(&staging).map_err(io_error)?;
        let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(zip_error)?;
        let mut library_raw = Vec::new();
        archive
            .by_name("library.json")
            .map_err(zip_error)?
            .read_to_end(&mut library_raw)
            .map_err(io_error)?;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(zip_error)?;
            let name = entry.name().replace('\\', "/");
            if !(name.starts_with("assets/")
                || name.starts_with("vaults/")
                || name.starts_with("audio/"))
                || name.ends_with('/')
            {
                continue;
            }
            let relative = entry
                .enclosed_name()
                .ok_or("BACKUP_PATH:备份包含不安全路径")?;
            let target = staging.join(relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(io_error)?;
            }
            let mut output = fs::File::create(target).map_err(io_error)?;
            std::io::copy(&mut entry, &mut output).map_err(io_error)?;
        }
        let restored: Value = serde_json::from_slice(&library_raw)
            .map_err(|error| format!("BACKUP_LIBRARY:资料库内容损坏：{error}"))?;
        let receipt = library.save(&restored, old.revision)?;
        for directory in ["assets", "vaults", "audio"] {
            let target = self.app_data.join(directory);
            let incoming = staging.join(directory);
            let old_path = self.app_data.join(format!("{directory}.restore-old"));
            if old_path.exists() {
                fs::remove_dir_all(&old_path).map_err(io_error)?;
            }
            if target.exists() {
                fs::rename(&target, &old_path).map_err(io_error)?;
            }
            if incoming.exists() {
                if let Err(error) = fs::rename(&incoming, &target) {
                    let _ = library.save(&old.data, receipt.committed_revision);
                    if old_path.exists() {
                        let _ = fs::rename(&old_path, &target);
                    }
                    return Err(io_error(error));
                }
            }
            if old_path.exists() {
                fs::remove_dir_all(old_path).map_err(io_error)?;
            }
        }
        fs::remove_dir_all(staging).map_err(io_error)?;
        Ok(())
    }
}

fn add_directory(
    zip: &mut ZipWriter<fs::File>,
    root: &Path,
    prefix: &str,
    options: SimpleFileOptions,
    checksums: &mut Vec<String>,
) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(root).map_err(io_error)? {
        let entry = entry.map_err(io_error)?;
        let path = entry.path();
        let name = format!("{prefix}/{}", entry.file_name().to_string_lossy());
        if path.is_dir() {
            add_directory(zip, &path, &name, options, checksums)?;
        } else {
            add_entry(
                zip,
                &name,
                &fs::read(path).map_err(io_error)?,
                options,
                checksums,
            )?;
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
fn inspect(bytes: &[u8]) -> Result<(Value, bool), String> {
    if bytes.len() > 2 * 1024 * 1024 * 1024 {
        return Err("BACKUP_SIZE:备份包过大".into());
    }
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(zip_error)?;
    let mut archive_entries = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(zip_error)?;
        if entry.enclosed_name().is_none() {
            return Err("BACKUP_PATH:备份包含不安全路径".into());
        }
        if !entry.is_dir() {
            if !archive_entries.insert(entry.name().replace('\\', "/")) {
                return Err("BACKUP_DUPLICATE:备份包含重复路径".into());
            }
        }
    }
    let mut manifest_raw = String::new();
    archive
        .by_name("manifest.json")
        .map_err(zip_error)?
        .read_to_string(&mut manifest_raw)
        .map_err(io_error)?;
    let manifest: Value =
        serde_json::from_str(&manifest_raw).map_err(|error| format!("BACKUP_MANIFEST:{error}"))?;
    if manifest.get("format").and_then(Value::as_str) != Some("yiyu-backup") {
        return Err("BACKUP_FORMAT:不是一隅备份包".into());
    }
    let mut checksum_raw = String::new();
    archive
        .by_name("checksums.sha256")
        .map_err(zip_error)?
        .read_to_string(&mut checksum_raw)
        .map_err(io_error)?;
    let mut valid = true;
    let mut checked_entries = HashSet::new();
    for line in checksum_raw.lines() {
        let Some((expected, name)) = line.split_once("  ") else {
            valid = false;
            continue;
        };
        if expected.len() != 64
            || !expected
                .chars()
                .all(|character| character.is_ascii_hexdigit())
            || !checked_entries.insert(name.to_string())
        {
            valid = false;
            continue;
        }
        let mut data = Vec::new();
        let read = match archive.by_name(name) {
            Ok(mut entry) => entry.read_to_end(&mut data).is_ok(),
            Err(_) => false,
        };
        if !read || format!("{:X}", Sha256::digest(&data)) != expected {
            valid = false;
        }
    }
    let required_entries = archive_entries
        .into_iter()
        .filter(|name| name != "checksums.sha256")
        .collect::<HashSet<_>>();
    if checked_entries != required_entries
        || !checked_entries.contains("library.json")
        || !checked_entries.contains("manifest.json")
    {
        valid = false;
    }
    Ok((manifest, valid))
}
fn safe_timestamp(value: &str) -> bool {
    (10..=64).contains(&value.len())
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '+' | 'T' | ':' | '.')
        })
}
fn safe_date(value: &str) -> bool {
    value.len() == 10
        && value.chars().enumerate().all(|(index, character)| {
            if index == 4 || index == 7 {
                character == '-'
            } else {
                character.is_ascii_digit()
            }
        })
}
fn receipt(path: &Path, created_at: String, automatic: bool) -> Result<BackupReceipt, String> {
    let bytes = fs::read(path).map_err(io_error)?;
    Ok(BackupReceipt {
        path: path.to_string_lossy().into_owned(),
        created_at,
        size: bytes.len() as u64,
        sha256: format!("{:X}", Sha256::digest(bytes)),
        automatic,
    })
}
fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}
fn count(value: &Value, key: &str) -> usize {
    value
        .get("counts")
        .and_then(|counts| counts.get(key))
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize
}
fn io_error(error: std::io::Error) -> String {
    format!("备份文件操作失败：{error}")
}
fn zip_error(error: zip::result::ZipError) -> String {
    format!("备份包操作失败：{error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;
    #[test]
    fn rejects_zip_path_traversal() {
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut bytes);
            writer
                .start_file("../escape", SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"bad").unwrap();
            writer.finish().unwrap();
        }
        assert!(inspect(bytes.get_ref()).is_err());
    }

    #[test]
    fn rejects_unchecked_entries_and_unsafe_dates() {
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut bytes);
            let options = SimpleFileOptions::default();
            writer.start_file("library.json", options).unwrap();
            writer.write_all(br#"{"works":[]}"#).unwrap();
            writer.start_file("manifest.json", options).unwrap();
            writer.write_all(br#"{"format":"yiyu-backup"}"#).unwrap();
            writer.start_file("checksums.sha256", options).unwrap();
            writer.finish().unwrap();
        }
        assert!(!inspect(bytes.get_ref()).unwrap().1);
        assert!(!safe_timestamp("../../outside"));
        assert!(safe_timestamp("2026-08-09T12:00:00.000Z"));
        assert!(!safe_date("2026/08/09"));
    }

    #[test]
    fn creates_previews_and_restores_a_checked_backup() {
        let directory = tempdir().unwrap();
        let app_data = directory.path().join("app");
        let library = LibraryRepository::at(app_data.clone());
        let original = json!({
            "works": [{"id":"work-1","title":"原始作品","chapterIds":["chapter-1"]}],
            "chapters": {"chapter-1":{"id":"chapter-1","workId":"work-1","title":"第一章","plainText":"备份正文","content":{"type":"doc","content":[]},"versions":[]}},
            "volumes": [], "people": [], "places": [], "events": [], "entityLinks": [],
            "assets": [], "aiGenerations": [], "settings": {}, "session": {}
        });
        library.save(&original, 0).unwrap();
        fs::create_dir_all(app_data.join("assets/asset-1")).unwrap();
        fs::write(app_data.join("assets/asset-1/original.png"), b"image").unwrap();
        fs::create_dir_all(app_data.join("audio")).unwrap();
        fs::write(app_data.join("audio/track-safe.mp3"), b"audio").unwrap();
        let repository = BackupRepository {
            root: directory.path().join("backups"),
            app_data,
        };
        let receipt = repository
            .create(&library, false, "2026-08-09T12:00:00+08:00")
            .unwrap();
        let bytes = fs::read(&receipt.path).unwrap();
        let preview = repository.preview(&bytes).unwrap();
        assert!(preview.checksums_valid);
        assert_eq!(preview.works, 1);
        assert_eq!(preview.chapters, 1);

        let changed = json!({"works": [], "chapters": {}, "volumes": [], "people": [], "places": [], "events": [], "entityLinks": [], "assets": [], "aiGenerations": [], "settings": {}, "session": {}});
        library.save(&changed, 1).unwrap();
        repository.restore(&library, &bytes).unwrap();
        assert_eq!(
            library.load().unwrap().unwrap().data["works"][0]["title"],
            "原始作品"
        );
        assert_eq!(
            fs::read(repository.app_data.join("assets/asset-1/original.png")).unwrap(),
            b"image"
        );
        assert_eq!(
            fs::read(repository.app_data.join("audio/track-safe.mp3")).unwrap(),
            b"audio"
        );
    }
}
