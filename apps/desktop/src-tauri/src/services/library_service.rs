use serde_json::Value;
use tauri::AppHandle;

use crate::repositories::{LibraryRepository, LibrarySnapshot, SaveReceipt};

pub struct LibraryService {
    repository: LibraryRepository,
}

impl LibraryService {
    pub fn new(app: AppHandle) -> Result<Self, String> {
        Ok(Self {
            repository: LibraryRepository::from_app(&app)?,
        })
    }

    pub fn load(&self) -> Result<Option<LibrarySnapshot>, String> {
        self.repository.load()
    }

    pub fn save(&self, data: &Value, expected_revision: i64) -> Result<SaveReceipt, String> {
        let schema_version = data
            .get("schemaVersion")
            .and_then(Value::as_u64)
            .ok_or("资料库缺少 schemaVersion")?;
        if schema_version != 1 {
            return Err(format!("不支持的资料库版本：{schema_version}"));
        }
        if !data.get("works").is_some_and(Value::is_array) {
            return Err("资料库 works 字段无效".to_owned());
        }
        self.repository.save(data, expected_revision)
    }
}
