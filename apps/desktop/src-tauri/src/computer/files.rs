use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};

use super::{policy::target_allowed, types::ComputerPolicy};

const MAX_TEXT_BYTES: u64 = 1_048_576;
const MAX_RESULTS: usize = 200;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub is_directory: bool,
    pub size: u64,
}

fn sensitive(path: &Path) -> bool {
    let value = path.to_string_lossy().replace('/', "\\").to_lowercase();
    ["\\.ssh\\", "\\.aws\\", "\\.gnupg\\", "\\credentials\\", "\\user data\\default\\login data", "\\id_rsa", "\\id_ed25519", "\\.git-credentials"]
        .iter()
        .any(|needle| value.contains(needle))
}

fn absolute(path: &str) -> Result<PathBuf, String> {
    let value = PathBuf::from(path.trim());
    if value.as_os_str().is_empty() || !value.is_absolute() {
        return Err("FILE_PATH_INVALID:必须使用绝对路径".into());
    }
    Ok(value)
}

fn canonical_target(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return path.canonicalize().map_err(|error| format!("FILE_PATH:{error}"));
    }
    let parent = path.parent().ok_or_else(|| "FILE_PATH_INVALID:路径缺少父目录".to_string())?;
    let canonical_parent = parent.canonicalize().map_err(|error| format!("FILE_PARENT:{error}"))?;
    let name = path.file_name().ok_or_else(|| "FILE_PATH_INVALID:路径缺少文件名".to_string())?;
    Ok(canonical_parent.join(name))
}

pub fn guard(policy: &ComputerPolicy, capability: &str, path: &str, confirmed: bool) -> Result<PathBuf, String> {
    let resolved = canonical_target(&absolute(path)?)?;
    if sensitive(&resolved) && !confirmed {
        return Err("FILE_SENSITIVE_CONFIRMATION_REQUIRED:敏感凭据或浏览器资料路径需要明确确认".into());
    }
    if !confirmed && !target_allowed(policy, capability, &resolved.to_string_lossy()) {
        return Err(format!("FILE_SCOPE_DENIED:路径不在已授权范围内：{}", resolved.display()));
    }
    Ok(resolved)
}

fn entry(path: PathBuf) -> Result<FileEntry, String> {
    let metadata = fs::metadata(&path).map_err(|error| format!("FILE_METADATA:{error}"))?;
    Ok(FileEntry {
        name: path.file_name().map(|value| value.to_string_lossy().into_owned()).unwrap_or_default(),
        path: path.to_string_lossy().into_owned(),
        is_directory: metadata.is_dir(),
        size: if metadata.is_file() { metadata.len() } else { 0 },
    })
}

pub fn list(policy: &ComputerPolicy, path: &str, recursive: bool, confirmed: bool) -> Result<Vec<FileEntry>, String> {
    let root = guard(policy, "file_read", path, confirmed)?;
    if !root.is_dir() {
        return Err("FILE_LIST_NOT_DIRECTORY:目标不是目录".into());
    }
    let mut result = Vec::new();
    let mut pending = vec![root];
    while let Some(directory) = pending.pop() {
        for item in fs::read_dir(&directory).map_err(|error| format!("FILE_LIST:{error}"))? {
            let path = item.map_err(|error| format!("FILE_LIST:{error}"))?.path();
            let current = entry(path.clone())?;
            if recursive && current.is_directory {
                pending.push(path);
            }
            result.push(current);
            if result.len() >= MAX_RESULTS {
                return Ok(result);
            }
        }
        if !recursive {
            break;
        }
    }
    Ok(result)
}

pub fn search(policy: &ComputerPolicy, path: &str, query: &str, confirmed: bool) -> Result<Vec<FileEntry>, String> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Err("FILE_SEARCH_INVALID:搜索词不能为空".into());
    }
    Ok(list(policy, path, true, confirmed)?
        .into_iter()
        .filter(|item| item.name.to_lowercase().contains(&needle))
        .take(MAX_RESULTS)
        .collect())
}

pub fn read_text(policy: &ComputerPolicy, path: &str, confirmed: bool) -> Result<String, String> {
    let target = guard(policy, "file_read", path, confirmed)?;
    let size = fs::metadata(&target).map_err(|error| format!("FILE_READ:{error}"))?.len();
    if size > MAX_TEXT_BYTES {
        return Err("FILE_TOO_LARGE:文本读取上限为 1 MiB".into());
    }
    fs::read_to_string(target).map_err(|error| format!("FILE_READ_UTF8:{error}"))
}

pub fn write_text(policy: &ComputerPolicy, path: &str, content: &str, confirmed: bool) -> Result<(), String> {
    if content.len() as u64 > MAX_TEXT_BYTES {
        return Err("FILE_TOO_LARGE:单次文本写入上限为 1 MiB".into());
    }
    let target = guard(policy, "file_write", path, confirmed)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("FILE_CREATE_DIR:{error}"))?;
    }
    fs::write(target, content.as_bytes()).map_err(|error| format!("FILE_WRITE:{error}"))
}

pub fn copy(policy: &ComputerPolicy, source: &str, destination: &str, confirmed: bool) -> Result<u64, String> {
    let source = guard(policy, "file_read", source, confirmed)?;
    let destination = guard(policy, "file_write", destination, confirmed)?;
    fs::copy(source, destination).map_err(|error| format!("FILE_COPY:{error}"))
}

pub fn move_file(policy: &ComputerPolicy, source: &str, destination: &str, confirmed: bool) -> Result<(), String> {
    let source = guard(policy, "file_delete", source, confirmed)?;
    let destination = guard(policy, "file_write", destination, confirmed)?;
    fs::rename(source, destination).map_err(|error| format!("FILE_MOVE:{error}"))
}

pub fn delete(policy: &ComputerPolicy, path: &str, confirmed: bool) -> Result<(), String> {
    let target = guard(policy, "file_delete", path, confirmed)?;
    let metadata = fs::metadata(&target).map_err(|error| format!("FILE_DELETE:{error}"))?;
    if metadata.is_dir() {
        fs::remove_dir(target).map_err(|error| format!("FILE_DELETE_DIRECTORY:{error}"))
    } else {
        fs::remove_file(target).map_err(|error| format!("FILE_DELETE:{error}"))
    }
}