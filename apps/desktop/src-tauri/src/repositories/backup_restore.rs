use std::{fs, io::{Cursor, Read, Seek, SeekFrom}, path::{Path, PathBuf}};
use serde_json::Value;
use zip::ZipArchive;
use super::{BackupRepository, LibraryRepository, validate_library, archive::*, shared};

impl BackupRepository {
    pub fn restore(&self, library: &LibraryRepository, bytes: &[u8]) -> Result<(), String> {
        let (manifest, _) = inspect(bytes)?;
        if manifest["formatVersion"] == 2 { return Err("BACKUP_SHARED:请从备份记录恢复自动快照，迁移时复制整个备份目录".into()); }
        self.restore_reader(library, Cursor::new(bytes))
    }

    pub fn restore_saved(&self, library: &LibraryRepository, path: &str) -> Result<(), String> {
        self.restore_reader(library, fs::File::open(self.saved_path(path)?).map_err(io_error)?)
    }

    fn restore_reader(&self, library: &LibraryRepository, mut reader: impl Read + Seek) -> Result<(), String> {
        let (manifest, valid) = inspect_reader(&mut reader)?;
        if !valid { return Err("BACKUP_CHECKSUM:备份校验失败，未修改当前资料库".into()); }
        let is_shared = manifest["formatVersion"] == 2;
        if is_shared { self.check_shared(&manifest)?; }
        reader.seek(SeekFrom::Start(0)).map_err(io_error)?;
        let mut archive = ZipArchive::new(reader).map_err(zip_error)?;
        let mut raw = Vec::new();
        archive.by_name("library.json").map_err(zip_error)?.read_to_end(&mut raw).map_err(io_error)?;
        let restored: Value = serde_json::from_slice(&raw).map_err(|e| format!("BACKUP_LIBRARY:{e}"))?;
        validate_library(&restored).map_err(|e| format!("BACKUP_LIBRARY:{e}"))?;
        let old = library.load()?.ok_or("RESTORE_EMPTY:当前资料库不可用")?;
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("BACKUP_CLOCK:{e}"))?.as_nanos();
        self.create(library, false, &format!("pre-restore-{stamp}"))?;
        let staging = self.app_data.join(format!("restore-staging-{stamp}"));
        fs::create_dir(&staging).map_err(io_error)?;
        let result = (|| {
            if is_shared { self.stage_shared(&manifest, &staging)?; }
            else {
                for index in 0..archive.len() {
                    let mut entry = archive.by_index(index).map_err(zip_error)?;
                    let name = entry.name().replace('\\', "/");
                    if !(name.starts_with("assets/") || name.starts_with("vaults/") || name.starts_with("audio/")) || name.ends_with('/') { continue; }
                    let target = staging.join(entry.enclosed_name().ok_or("BACKUP_PATH:备份包含不安全路径")?);
                    fs::create_dir_all(target.parent().ok_or("BACKUP_PATH:路径缺少父目录")?).map_err(io_error)?;
                    let mut output = fs::File::create(target).map_err(io_error)?;
                    std::io::copy(&mut entry, &mut output).map_err(io_error)?;
                }
            }
            publish_directories(&self.app_data, &staging, || library.save(&restored, old.revision).map(|_| ()))
        })();
        let _ = fs::remove_dir_all(&staging);
        result
    }
}

struct DirectorySwap { target: PathBuf, old: PathBuf, had_original: bool }

pub(super) fn publish_directories(app_data: &Path, staging: &Path, save: impl FnOnce() -> Result<(), String>) -> Result<(), String> {
    let mut swaps = Vec::new();
    let result = (|| {
        for name in ["assets", "vaults", "audio"] {
            let target = app_data.join(name);
            let incoming = staging.join(name);
            let old = app_data.join(format!("{name}.restore-old"));
            if old.exists() { return Err("RESTORE_RECOVERY:存在上次恢复保留的目录，已停止，未覆盖".into()); }
            if target.exists() { shared::no_link(&target)?; fs::rename(&target, &old).map_err(io_error)?; }
            let swap = DirectorySwap { target: target.clone(), had_original: old.exists(), old };
            swaps.push(swap);
            if incoming.exists() { fs::rename(&incoming, &target).map_err(io_error)?; }
        }
        save()
    })();
    if let Err(error) = result {
        let mut rollback_error = None;
        for swap in swaps.iter().rev() {
            if swap.target.exists() {
                if let Err(error) = fs::remove_dir_all(&swap.target) { rollback_error = Some(error); continue; }
            }
            if swap.had_original {
                if let Err(error) = fs::rename(&swap.old, &swap.target) { rollback_error = Some(error); }
            }
        }
        return Err(match rollback_error {
            Some(rollback) => format!("{error}；RESTORE_ROLLBACK:回滚失败，原文件保留于 .restore-old：{rollback}"),
            None => error,
        });
    }
    for swap in swaps {
        if swap.had_original { let _ = fs::remove_dir_all(swap.old); }
    }
    Ok(())
}
