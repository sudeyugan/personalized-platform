use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use super::storage_root;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryDraft {
    pub chapter_id: String,
    pub content: Value,
    pub plain_text: String,
    pub updated_at: String,
}

pub struct RecoveryRepository {
    directory: PathBuf,
}

impl RecoveryRepository {
    pub fn from_app(app: &AppHandle) -> Result<Self, String> {
        let directory = storage_root(app)?.join("recovery").join("drafts");
        Ok(Self { directory })
    }

    #[cfg(test)]
    pub fn at(directory: PathBuf) -> Self {
        Self { directory }
    }

    pub fn save(&self, draft: &RecoveryDraft) -> Result<(), String> {
        validate_id(&draft.chapter_id)?;
        fs::create_dir_all(&self.directory).map_err(io_error)?;
        let target = self.directory.join(format!("{}.json", draft.chapter_id));
        let partial = self.directory.join(format!("{}.partial", draft.chapter_id));
        let bytes = serde_json::to_vec_pretty(draft)
            .map_err(|error| format!("无法序列化恢复草稿：{error}"))?;
        fs::write(&partial, bytes).map_err(io_error)?;
        fs::rename(&partial, &target).map_err(io_error)
    }

    pub fn load_all(&self) -> Result<Vec<RecoveryDraft>, String> {
        if !self.directory.exists() {
            return Ok(Vec::new());
        }
        let mut drafts = Vec::new();
        for entry in fs::read_dir(&self.directory).map_err(io_error)? {
            let path = entry.map_err(io_error)?.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let raw = fs::read_to_string(path).map_err(io_error)?;
            drafts.push(
                serde_json::from_str(&raw).map_err(|error| format!("恢复草稿格式损坏：{error}"))?,
            );
        }
        Ok(drafts)
    }

    pub fn clear(&self, chapter_id: &str) -> Result<(), String> {
        validate_id(chapter_id)?;
        let path = self.directory.join(format!("{chapter_id}.json"));
        if path.exists() {
            fs::remove_file(path).map_err(io_error)?;
        }
        Ok(())
    }
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || !id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("INVALID_CHAPTER_ID:章节标识只能包含字母、数字和连字符".into());
    }
    Ok(())
}

fn io_error(error: std::io::Error) -> String {
    format!("恢复草稿操作失败：{error}")
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use tempfile::tempdir;

    use super::{RecoveryDraft, RecoveryRepository};

    #[test]
    fn round_trips_and_clears_draft() {
        let directory = tempdir().unwrap();
        let repository = RecoveryRepository::at(directory.path().to_path_buf());
        let draft = RecoveryDraft {
            chapter_id: "chapter-1".into(),
            content: json!({"type": "doc"}),
            plain_text: "未保存正文".into(),
            updated_at: "2026-08-08T00:00:00.000Z".into(),
        };
        repository.save(&draft).unwrap();
        assert_eq!(repository.load_all().unwrap(), vec![draft]);
        repository.clear("chapter-1").unwrap();
        assert!(repository.load_all().unwrap().is_empty());
    }

    #[test]
    fn rejects_path_traversal() {
        let directory = tempdir().unwrap();
        let repository = RecoveryRepository::at(directory.path().to_path_buf());
        assert!(repository.clear("../outside").is_err());
    }
}
