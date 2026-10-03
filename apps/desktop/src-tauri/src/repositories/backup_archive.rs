use std::{collections::HashSet, fs, io::{Cursor, Read, Seek}, path::Path};
use serde_json::Value;
use sha2::{Digest, Sha256};
use zip::ZipArchive;
use super::BackupReceipt;
pub(super) const MAX_ARCHIVE_BYTES: usize = 2 * 1024 * 1024 * 1024;
pub(super) const MAX_ARCHIVE_ENTRIES: usize = 10_000;
pub(super) const MAX_EXPANDED_BYTES: u64 = 4 * 1024 * 1024 * 1024;
pub(super) const MAX_ENTRY_BYTES: u64 = 512 * 1024 * 1024;

pub(super) fn inspect(bytes: &[u8]) -> Result<(Value, bool), String> {
    if bytes.len() > MAX_ARCHIVE_BYTES {
        return Err("BACKUP_SIZE:备份包过大".into());
    }
    inspect_reader(Cursor::new(bytes))
}

pub(super) fn inspect_reader(mut reader: impl Read + Seek) -> Result<(Value, bool), String> {
    let size = reader.seek(std::io::SeekFrom::End(0)).map_err(io_error)?;
    if size > MAX_ARCHIVE_BYTES as u64 { return Err("BACKUP_SIZE:备份包过大".into()); }
    reader.seek(std::io::SeekFrom::Start(0)).map_err(io_error)?;
    let mut archive = ZipArchive::new(reader).map_err(zip_error)?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err("BACKUP_ENTRIES:备份文件数量过多".into());
    }
    let mut archive_entries = HashSet::new();
    let mut expanded_bytes = 0_u64;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(zip_error)?;
        if entry.enclosed_name().is_none() {
            return Err("BACKUP_PATH:备份包含不安全路径".into());
        }
        if entry.size() > MAX_ENTRY_BYTES {
            return Err("BACKUP_ENTRY_SIZE:备份内单个文件过大".into());
        }
        expanded_bytes = expanded_bytes.checked_add(entry.size())
            .ok_or("BACKUP_EXPANDED_SIZE:备份解压大小溢出")?;
        if expanded_bytes > MAX_EXPANDED_BYTES {
            return Err("BACKUP_EXPANDED_SIZE:备份解压后过大".into());
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
    if manifest.get("formatVersion").and_then(Value::as_u64) != Some(1) && manifest.get("formatVersion").and_then(Value::as_u64) != Some(2) {
        return Err("BACKUP_VERSION:不支持的备份格式版本".into());
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
        let actual = match archive.by_name(name) {
            Ok(mut entry) => hash_reader(&mut entry).ok(),
            Err(_) => None,
        };
        if actual.as_deref() != Some(expected) {
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

pub(super) fn hash_reader(reader: &mut impl Read) -> Result<String, String> {
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = reader.read(&mut buffer).map_err(io_error)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:X}", hasher.finalize()))
}

pub(super) fn safe_timestamp(value: &str) -> bool {
    (10..=64).contains(&value.len())
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '+' | 'T' | ':' | '.')
        })
}
pub(super) fn date_day(value: &str) -> Option<i64> {
    if value.len() != 10 || !value.bytes().enumerate().all(|(index, byte)| {
        if index == 4 || index == 7 { byte == b'-' } else { byte.is_ascii_digit() }
    }) { return None; }
    let year: i64 = value.get(..4)?.parse().ok()?;
    let month: usize = value.get(5..7)?.parse().ok()?;
    let day: i64 = value.get(8..)?.parse().ok()?;
    if !(1970..=9999).contains(&year) || !(1..=12).contains(&month) { return None; }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let months = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if day < 1 || day > months[month - 1] { return None; }
    let years = year - 1;
    Some(365 * years + years / 4 - years / 100 + years / 400 + months[..month - 1].iter().sum::<i64>() + day)
}
pub(super) fn safe_date(value: &str) -> bool { date_day(value).is_some() }
pub(super) fn receipt(path: &Path, created_at: String, automatic: bool) -> Result<BackupReceipt, String> {
    let mut file = fs::File::open(path).map_err(io_error)?;
    let size = file.metadata().map_err(io_error)?.len();
    Ok(BackupReceipt {
        path: path.to_string_lossy().into_owned(),
        created_at,
        size,
        sha256: hash_reader(&mut file)?,
        automatic,
        shared: path.extension().and_then(|s| s.to_str()) == Some(super::shared::SNAPSHOT_EXTENSION),
    })
}
pub(super) fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}
pub(super) fn count(value: &Value, key: &str) -> usize {
    value
        .get("counts")
        .and_then(|counts| counts.get(key))
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize
}
pub(super) fn io_error(error: std::io::Error) -> String {
    format!("备份文件操作失败：{error}")
}
pub(super) fn zip_error(error: zip::result::ZipError) -> String {
    format!("备份包操作失败：{error}")
}
