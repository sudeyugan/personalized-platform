use std::{collections::HashSet, fs, path::{Component, Path}};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use super::{BackupRepository, archive::*};

pub(super) const SNAPSHOT_EXTENSION: &str = "yiyu-snapshot";
const POOL: &str = "共享素材";

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct SharedFile {
    pub path: String,
    pub sha256: String,
    pub size: u64,
}

fn checked_path(value: &str) -> bool {
    let mut parts = value.split('/');
    if !matches!(parts.next(), Some("assets" | "vaults" | "audio")) { return false; }
    let rest = parts.collect::<Vec<_>>();
    !rest.is_empty() && rest.iter().all(|part| {
        !part.is_empty() && *part != "." && *part != ".."
            && !part.ends_with(['.', ' '])
            && !part.chars().any(|c| c < ' ' || matches!(c, '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*'))
            && !matches!(part.split('.').next().unwrap_or("").to_ascii_uppercase().as_str(),
                "CON" | "PRN" | "AUX" | "NUL" | "COM1" | "COM2" | "COM3" | "COM4" | "COM5" | "COM6" | "COM7" | "COM8" | "COM9" | "LPT1" | "LPT2" | "LPT3" | "LPT4" | "LPT5" | "LPT6" | "LPT7" | "LPT8" | "LPT9")
    }) && Path::new(value).components().all(|part| matches!(part, Component::Normal(_)))
}

pub(super) fn references(manifest: &Value) -> Result<Vec<SharedFile>, String> {
    let files: Vec<SharedFile> = serde_json::from_value(manifest.get("files").cloned().ok_or("BACKUP_SHARED:缺少共享素材清单")?)
        .map_err(|_| "BACKUP_SHARED:共享素材清单损坏")?;
    if files.len() > MAX_ARCHIVE_ENTRIES { return Err("BACKUP_ENTRIES:共享素材数量过多".into()); }
    let mut names = HashSet::new();
    let mut total = 0_u64;
    for file in &files {
        if !checked_path(&file.path) || !names.insert(file.path.to_lowercase())
            || file.sha256.len() != 64 || !file.sha256.bytes().all(|c| c.is_ascii_digit() || (b'A'..=b'F').contains(&c))
            || file.size > MAX_ENTRY_BYTES {
            return Err("BACKUP_SHARED:共享素材路径、大小或校验值不合法".into());
        }
        total = total.checked_add(file.size).ok_or("BACKUP_SIZE:共享素材大小溢出")?;
        if total > MAX_EXPANDED_BYTES { return Err("BACKUP_SIZE:共享素材总大小超出安全上限".into()); }
    }
    for name in &names {
        let mut parent = Path::new(name).parent();
        while let Some(path) = parent {
            if names.contains(&path.to_string_lossy().replace('\\', "/")) {
                return Err("BACKUP_SHARED:共享素材包含冲突路径".into());
            }
            parent = path.parent();
        }
    }
    Ok(files)
}

pub(super) fn no_link(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(io_error)?;
    if metadata.file_type().is_symlink() { return Err("BACKUP_PATH:备份不允许符号链接".into()); }
    Ok(())
}

impl BackupRepository {
    pub(super) fn prepare_root(&self) -> Result<(), String> {
        fs::create_dir_all(&self.root).map_err(io_error)?;
        let root = self.root.canonicalize().map_err(io_error)?;
        for name in ["assets", "vaults", "audio"] {
            let media = self.app_data.join(name);
            if media.exists() && root.starts_with(media.canonicalize().map_err(io_error)?) {
                return Err("BACKUP_DIRECTORY:备份目录不能放在素材或加密资料目录内".into());
            }
        }
        Ok(())
    }

    fn pool(&self) -> Result<std::path::PathBuf, String> {
        let path = self.root.join(POOL);
        if path.exists() { no_link(&path)?; }
        fs::create_dir_all(&path).map_err(io_error)?;
        Ok(path)
    }

    pub(super) fn collect_shared(&self) -> Result<Vec<SharedFile>, String> {
        let mut files = Vec::new();
        for name in ["assets", "vaults", "audio"] {
            let path = self.app_data.join(name);
            if path.exists() { self.collect_directory(&path, name, &mut files)?; }
        }
        Ok(files)
    }

    fn collect_directory(&self, path: &Path, prefix: &str, files: &mut Vec<SharedFile>) -> Result<(), String> {
        no_link(path)?;
        for entry in fs::read_dir(path).map_err(io_error)? {
            let entry = entry.map_err(io_error)?;
            let source = entry.path();
            no_link(&source)?;
            let name = format!("{prefix}/{}", entry.file_name().to_str().ok_or("BACKUP_PATH:素材文件名不是 UTF-8")?);
            if source.is_dir() {
                self.collect_directory(&source, &name, files)?;
                continue;
            }
            if !checked_path(&name) || !source.is_file() { return Err("BACKUP_PATH:素材路径不合法".into()); }
            let mut input = fs::File::open(&source).map_err(io_error)?;
            let size = input.metadata().map_err(io_error)?.len();
            if size > MAX_ENTRY_BYTES { return Err("BACKUP_ENTRY_SIZE:素材文件过大".into()); }
            let hash = hash_reader(&mut input)?;
            let pool = self.pool()?;
            let target = pool.join(&hash);
            if target.exists() {
                self.check_blob(&SharedFile { path: name.clone(), sha256: hash.clone(), size })?;
            } else {
                let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| format!("BACKUP_CLOCK:{e}"))?.as_nanos();
                let partial = pool.join(format!("{hash}.{nonce}.partial"));
                let mut owned = false;
                let result = (|| {
                    no_link(&source)?;
                    let mut output = fs::OpenOptions::new().create_new(true).write(true).open(&partial).map_err(io_error)?;
                    owned = true;
                    let mut input = fs::File::open(&source).map_err(io_error)?;
                    std::io::copy(&mut input, &mut output).map_err(io_error)?;
                    output.sync_all().map_err(io_error)?;
                    let mut copied = fs::File::open(&partial).map_err(io_error)?;
                    if copied.metadata().map_err(io_error)?.len() != size || hash_reader(&mut copied)? != hash {
                        return Err("BACKUP_CHANGED:素材在备份期间发生变化，请重试".into());
                    }
                    fs::rename(&partial, &target).map_err(io_error)
                })();
                // Only remove the temporary file owned by this attempt.
                if result.is_err() && owned && partial.exists() {
                    if fs::symlink_metadata(&partial).map(|m| m.is_file() && !m.file_type().is_symlink()).unwrap_or(false) {
                        let _ = fs::remove_file(&partial);
                    }
                }
                result?;
            }
            files.push(SharedFile { path: name, sha256: hash, size });
            if files.len() > MAX_ARCHIVE_ENTRIES { return Err("BACKUP_ENTRIES:素材文件数量过多".into()); }
        }
        Ok(())
    }

    fn check_blob(&self, file: &SharedFile) -> Result<std::path::PathBuf, String> {
        let pool = self.root.join(POOL);
        no_link(&pool)?;
        let path = pool.join(&file.sha256);
        no_link(&path).map_err(|_| "BACKUP_SHARED_MISSING:共享素材缺失，请复制完整备份目录".to_string())?;
        let mut input = fs::File::open(&path).map_err(io_error)?;
        if input.metadata().map_err(io_error)?.len() != file.size || hash_reader(&mut input)? != file.sha256 {
            return Err("BACKUP_SHARED_CHECKSUM:共享素材损坏，未修改当前资料".into());
        }
        Ok(path)
    }

    pub(super) fn check_shared(&self, manifest: &Value) -> Result<(), String> {
        for file in references(manifest)? { self.check_blob(&file)?; }
        Ok(())
    }

    pub(super) fn stage_shared(&self, manifest: &Value, staging: &Path) -> Result<(), String> {
        for file in references(manifest)? {
            let source = self.check_blob(&file)?;
            let target = staging.join(&file.path);
            fs::create_dir_all(target.parent().ok_or("BACKUP_PATH:素材路径缺少父目录")?).map_err(io_error)?;
            fs::copy(source, &target).map_err(io_error)?;
            let mut copied = fs::File::open(target).map_err(io_error)?;
            if hash_reader(&mut copied)? != file.sha256 { return Err("BACKUP_SHARED_CHECKSUM:恢复素材校验失败".into()); }
        }
        Ok(())
    }

    pub(super) fn prune_automatic(&self, retention: usize, newest: &str) -> Result<(), String> {
        let mut items = self.list()?.into_iter().filter(|item| item.automatic).collect::<Vec<_>>();
        items.sort_by(|a, b| (b.path == newest).cmp(&(a.path == newest)).then(b.created_at.cmp(&a.created_at)));
        // Check every reference manifest before deleting anything; damaged snapshots stop collection.
        self.live_hashes()?;
        for item in items.into_iter().skip(retention.clamp(1, 100)) {
            fs::remove_file(item.path).map_err(io_error)?;
        }
        let live = self.live_hashes()?;
        let pool = self.root.join(POOL);
        if !pool.exists() { return Ok(()); }
        no_link(&pool)?;
        for entry in fs::read_dir(pool).map_err(io_error)? {
            let entry = entry.map_err(io_error)?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.len() == 64 && name.bytes().all(|c| c.is_ascii_digit() || (b'A'..=b'F').contains(&c)) && !live.contains(&name) {
                no_link(&entry.path())?;
                if entry.path().is_file() { fs::remove_file(entry.path()).map_err(io_error)?; }
            }
        }
        Ok(())
    }

    fn live_hashes(&self) -> Result<HashSet<String>, String> {
        let mut live = HashSet::new();
        for entry in fs::read_dir(&self.root).map_err(io_error)? {
            let path = entry.map_err(io_error)?.path();
            if path.extension().and_then(|s| s.to_str()) != Some(SNAPSHOT_EXTENSION) { continue; }
            no_link(&path)?;
            let (manifest, valid) = inspect_reader(fs::File::open(&path).map_err(io_error)?)?;
            if !valid || manifest["formatVersion"] != 2 { return Err("BACKUP_GC:快照校验失败，已停止清理".into()); }
            for file in references(&manifest)? { live.insert(file.sha256); }
        }
        Ok(live)
    }
}
