use serde_json::Value;
use tauri::AppHandle;

use crate::repositories::{LibraryRepository, LibrarySnapshot, SaveReceipt, validate_library};

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
        validate_library(data)?;
        self.repository.save(data, expected_revision)
    }
}
