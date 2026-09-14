use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use serde::Deserialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFile {
    pub relative_path: String,
    pub bytes: Vec<u8>,
}

pub struct TransferRepository {
    root: PathBuf,
}
impl TransferRepository {
    pub fn from_app(app: &AppHandle) -> Result<Self, String> {
        let base = app
            .path()
            .document_dir()
            .or_else(|_| app.path().app_data_dir())
            .map_err(|error| format!("无法定位导出目录：{error}"))?;
        Ok(Self {
            root: base.join("一隅导出"),
        })
    }
    pub fn write_bundle(&self, name: &str, files: Vec<ExportFile>) -> Result<String, String> {
        if files.is_empty() || files.len() > 1000 {
            return Err("EXPORT_ENTRIES:导出文件数量不合法".into());
        }
        let safe = sanitize_name(name);
        if safe.is_empty() {
            return Err("EXPORT_NAME:导出名称不合法".into());
        }
        let target = self.root.join(&safe);
        let staging = self.root.join(format!(".{safe}.partial"));
        if staging.exists() {
            fs::remove_dir_all(&staging).map_err(io_error)?
        }
        fs::create_dir_all(&staging).map_err(io_error)?;
        let mut total = 0usize;
        for file in files {
            total = total.saturating_add(file.bytes.len());
            if total > 1024 * 1024 * 1024 {
                return Err("EXPORT_SIZE:导出内容超过 1 GB".into());
            }
            let relative = validate_relative(&file.relative_path)?;
            let path = staging.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(io_error)?
            }
            fs::write(path, file.bytes).map_err(io_error)?;
        }
        fs::create_dir_all(&self.root).map_err(io_error)?;
        if target.exists() {
            return Err("EXPORT_EXISTS:同名导出目录已存在，请修改作品名或移走旧导出".into());
        }
        fs::rename(staging, &target).map_err(io_error)?;
        Ok(target.to_string_lossy().into_owned())
    }
}
fn validate_relative(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("EXPORT_PATH:导出路径不安全".into());
    }
    Ok(path.to_path_buf())
}
fn sanitize_name(value: &str) -> String {
    value
        .chars()
        .filter(|c| !"<>:\"/\\|?*".contains(*c) && !c.is_control())
        .take(100)
        .collect::<String>()
        .trim()
        .trim_end_matches('.')
        .to_string()
}
fn io_error(error: std::io::Error) -> String {
    format!("导出文件操作失败：{error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rejects_export_path_traversal() {
        assert!(validate_relative("../secret.txt").is_err());
        assert!(validate_relative("chapters/01.md").is_ok());
    }

    #[test]
    fn stages_and_publishes_an_open_export_bundle() {
        let directory = tempdir().unwrap();
        let repository = TransferRepository {
            root: directory.path().join("exports"),
        };
        let path = repository
            .write_bundle(
                "我的作品",
                vec![ExportFile {
                    relative_path: "chapters/001.md".into(),
                    bytes: b"chapter".to_vec(),
                }],
            )
            .unwrap();
        assert_eq!(
            fs::read(Path::new(&path).join("chapters/001.md")).unwrap(),
            b"chapter"
        );
        assert!(!repository.root.join(".我的作品.partial").exists());
        assert!(
            repository
                .write_bundle(
                    "我的作品",
                    vec![ExportFile {
                        relative_path: "README.md".into(),
                        bytes: vec![]
                    }]
                )
                .is_err()
        );
    }
}
