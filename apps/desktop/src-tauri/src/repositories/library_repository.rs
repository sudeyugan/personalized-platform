use std::{fs, path::PathBuf};

use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use super::storage_root;
use super::{
    library_migrations::migrate,
    library_projections::{refresh_record_projections, refresh_search_index},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub data: Value,
    pub revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReceipt {
    pub committed_revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub chapter_id: String,
    pub title: String,
    pub excerpt: String,
}

pub struct LibraryRepository {
    database_path: PathBuf,
    legacy_path: PathBuf,
}

impl LibraryRepository {
    pub fn from_app(app: &AppHandle) -> Result<Self, String> {
        let directory = storage_root(app)?;
        Ok(Self::at(directory))
    }

    pub fn at(directory: PathBuf) -> Self {
        Self {
            database_path: directory.join("yiyu.sqlite"),
            legacy_path: directory.join("library-v1.json"),
        }
    }

    pub fn load(&self) -> Result<Option<LibrarySnapshot>, String> {
        let connection = self.open()?;
        connection
            .query_row(
                "SELECT data_json, revision FROM library_state WHERE id = 1",
                [],
                |row| {
                    let raw: String = row.get(0)?;
                    let revision = row.get(1)?;
                    Ok((raw, revision))
                },
            )
            .optional()
            .map_err(db_error)?
            .map(|(raw, revision)| {
                serde_json::from_str(&raw)
                    .map(|data| LibrarySnapshot { data, revision })
                    .map_err(|error| format!("资料库内容损坏：{error}"))
            })
            .transpose()
    }

    pub fn save(&self, value: &Value, expected_revision: i64) -> Result<SaveReceipt, String> {
        let mut connection = self.open()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(db_error)?;
        let current_revision: i64 = transaction
            .query_row(
                "SELECT revision FROM library_state WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(db_error)?
            .unwrap_or(0);
        if current_revision != expected_revision {
            return Err(format!(
                "REVISION_CONFLICT:预期修订 {expected_revision}，当前修订 {current_revision}"
            ));
        }

        let committed_revision = current_revision + 1;
        let data_json =
            serde_json::to_string(value).map_err(|error| format!("无法序列化资料库：{error}"))?;
        transaction
            .execute(
                "INSERT INTO library_state (id, revision, schema_version, data_json, updated_at)
                 VALUES (1, ?1, 1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, data_json = excluded.data_json, updated_at = excluded.updated_at",
                params![committed_revision, data_json],
            )
            .map_err(db_error)?;
        refresh_search_index(&transaction, value)?;
        refresh_record_projections(&transaction, value)?;
        transaction.commit().map_err(db_error)?;
        Ok(SaveReceipt { committed_revision })
    }

    pub fn search(&self, query: &str) -> Result<Vec<SearchHit>, String> {
        if query.trim().is_empty() {
            return Ok(Vec::new());
        }
        let connection = self.open()?;
        if query.trim().chars().count() < 3 {
            let pattern = format!("%{}%", query.trim());
            let mut statement = connection
                .prepare(
                    "SELECT chapter_id, title, substr(plain_text, 1, 80)
                     FROM chapter_search WHERE title LIKE ?1 OR plain_text LIKE ?1 LIMIT 30",
                )
                .map_err(db_error)?;
            let rows = statement
                .query_map([pattern], |row| {
                    Ok(SearchHit {
                        chapter_id: row.get(0)?,
                        title: row.get(1)?,
                        excerpt: row.get(2)?,
                    })
                })
                .map_err(db_error)?;
            return rows.collect::<Result<Vec<_>, _>>().map_err(db_error);
        }
        let phrase = format!("\"{}\"", query.trim().replace('"', "\"\""));
        let mut statement = connection
            .prepare(
                "SELECT chapter_id, title, snippet(chapter_search, 2, '‹', '›', '…', 18)
                 FROM chapter_search WHERE chapter_search MATCH ?1 LIMIT 30",
            )
            .map_err(db_error)?;
        let rows = statement
            .query_map([phrase], |row| {
                Ok(SearchHit {
                    chapter_id: row.get(0)?,
                    title: row.get(1)?,
                    excerpt: row.get(2)?,
                })
            })
            .map_err(db_error)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
    }

    fn open(&self) -> Result<Connection, String> {
        if let Some(parent) = self.database_path.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("无法创建资料库目录：{error}"))?;
        }
        let mut connection = Connection::open(&self.database_path).map_err(db_error)?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;",
            )
            .map_err(db_error)?;
        migrate(&mut connection)?;
        self.import_legacy(&connection)?;
        self.ensure_search_index(&mut connection)?;
        self.ensure_record_projections(&mut connection)?;
        Ok(connection)
    }

    fn ensure_search_index(&self, connection: &mut Connection) -> Result<(), String> {
        let indexed: i64 = connection
            .query_row("SELECT COUNT(*) FROM chapter_search", [], |row| row.get(0))
            .map_err(db_error)?;
        if indexed > 0 {
            return Ok(());
        }
        let raw: Option<String> = connection
            .query_row(
                "SELECT data_json FROM library_state WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(db_error)?;
        let Some(raw) = raw else { return Ok(()) };
        let value: Value =
            serde_json::from_str(&raw).map_err(|error| format!("资料库内容损坏：{error}"))?;
        let transaction = connection.transaction().map_err(db_error)?;
        refresh_search_index(&transaction, &value)?;
        transaction.commit().map_err(db_error)
    }

    fn ensure_record_projections(&self, connection: &mut Connection) -> Result<(), String> {
        let raw: Option<String> = connection
            .query_row(
                "SELECT data_json FROM library_state WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(db_error)?;
        let Some(raw) = raw else { return Ok(()) };
        let value: Value =
            serde_json::from_str(&raw).map_err(|error| format!("资料库内容损坏：{error}"))?;
        let transaction = connection.transaction().map_err(db_error)?;
        refresh_record_projections(&transaction, &value)?;
        transaction.commit().map_err(db_error)
    }

    fn import_legacy(&self, connection: &Connection) -> Result<(), String> {
        let has_state: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM library_state WHERE id = 1)",
                [],
                |row| row.get(0),
            )
            .map_err(db_error)?;
        if has_state || !self.legacy_path.exists() {
            return Ok(());
        }
        let raw = fs::read_to_string(&self.legacy_path)
            .map_err(|error| format!("无法读取旧资料库：{error}"))?;
        let data: Value =
            serde_json::from_str(&raw).map_err(|error| format!("旧资料库格式损坏：{error}"))?;
        connection.execute(
            "INSERT INTO library_state (id, revision, schema_version, data_json, updated_at) VALUES (1, 1, 1, ?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            [serde_json::to_string(&data).map_err(|error| error.to_string())?],
        ).map_err(db_error)?;
        Ok(())
    }
}

pub(super) fn db_error(error: rusqlite::Error) -> String {
    format!("SQLite 操作失败：{error}")
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::Instant;

    use super::LibraryRepository;
    use serde_json::json;
    use tempfile::tempdir;

    #[test]
    fn migrates_and_round_trips_library() {
        let directory = tempdir().unwrap();
        let repository = LibraryRepository::at(directory.path().to_path_buf());
        let receipt = repository
            .save(&json!({"schemaVersion": 1, "works": []}), 0)
            .unwrap();
        assert_eq!(receipt.committed_revision, 1);
        let snapshot = repository.load().unwrap().unwrap();
        assert_eq!(snapshot.revision, 1);
        assert_eq!(snapshot.data["works"], json!([]));
    }

    #[test]
    fn rejects_a_stale_revision() {
        let directory = tempdir().unwrap();
        let repository = LibraryRepository::at(directory.path().to_path_buf());
        repository
            .save(&json!({"schemaVersion": 1, "works": []}), 0)
            .unwrap();
        let error = repository
            .save(&json!({"schemaVersion": 1, "works": [1]}), 0)
            .unwrap_err();
        assert!(error.starts_with("REVISION_CONFLICT:"));
        assert_eq!(repository.load().unwrap().unwrap().data["works"], json!([]));
    }

    #[test]
    fn imports_legacy_json_without_deleting_it() {
        let directory = tempdir().unwrap();
        let legacy = directory.path().join("library-v1.json");
        fs::write(
            &legacy,
            serde_json::to_vec(&json!({"schemaVersion": 1, "works": ["legacy"]})).unwrap(),
        )
        .unwrap();
        let repository = LibraryRepository::at(directory.path().to_path_buf());
        let snapshot = repository.load().unwrap().unwrap();
        assert_eq!(snapshot.revision, 1);
        assert_eq!(snapshot.data["works"], json!(["legacy"]));
        assert!(legacy.exists());
    }

    #[test]
    fn migrations_are_idempotent() {
        let directory = tempdir().unwrap();
        let repository = LibraryRepository::at(directory.path().to_path_buf());
        assert!(repository.load().unwrap().is_none());
        assert!(repository.load().unwrap().is_none());
    }

    #[test]
    fn indexes_and_searches_chapters() {
        let directory = tempdir().unwrap();
        let repository = LibraryRepository::at(directory.path().to_path_buf());
        repository
            .save(
                &json!({
                    "schemaVersion": 1,
                    "chapters": {
                        "chapter-1": {"title": "雨夜", "plainText": "屋檐下听见晚风"},
                        "chapter-2": {"title": "旧稿", "plainText": "不应出现", "deletedAt": "2026-08-08"}
                    }
                }),
                0,
            )
            .unwrap();
        let hits = repository.search("晚风").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].chapter_id, "chapter-1");
        assert!(repository.search("不应出现").unwrap().is_empty());
    }

    #[test]
    fn searches_ten_thousand_chapters_within_budget() {
        let directory = tempdir().unwrap();
        let repository = LibraryRepository::at(directory.path().to_path_buf());
        let chapters = (0..10_000)
            .map(|index| {
                let text = if index == 9_999 {
                    "旧院子里的唯一风铃"
                } else {
                    "普通章节内容"
                };
                (
                    format!("chapter-{index}"),
                    json!({"title": format!("章节 {index}"), "plainText": text}),
                )
            })
            .collect::<serde_json::Map<_, _>>();
        repository
            .save(&json!({"schemaVersion": 1, "chapters": chapters}), 0)
            .unwrap();

        let started = Instant::now();
        let hits = repository.search("唯一风铃").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].chapter_id, "chapter-9999");
        assert!(started.elapsed().as_secs_f32() < 1.0);
    }

    #[test]
    fn projects_m3_records_and_bidirectional_links() {
        let directory = tempdir().unwrap();
        let repository = LibraryRepository::at(directory.path().to_path_buf());
        repository.save(&json!({"schemaVersion": 1, "works": [], "people": [{"id":"p1","name":"外婆"}], "places": [], "events": [{"id":"e1","title":"夏天","precision":"year","manualOrder":0}], "personRelations": [], "entityLinks": [{"id":"l1","sourceType":"chapter","sourceId":"c1","targetType":"person","targetId":"p1","relationType":"mentions"}]}), 0).unwrap();
        let connection = repository.open().unwrap();
        let people: i64 = connection
            .query_row("SELECT COUNT(*) FROM people", [], |row| row.get(0))
            .unwrap();
        let reverse: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM entity_links WHERE target_type='person' AND target_id='p1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!((people, reverse), (1, 1));
    }

    #[test]
    fn simulated_disk_full_preserves_last_commit() {
        let directory = tempdir().unwrap();
        let repository = LibraryRepository::at(directory.path().to_path_buf());
        repository
            .save(&json!({"schemaVersion": 1, "works": ["safe"]}), 0)
            .unwrap();
        let connection = repository.open().unwrap();
        connection
            .execute_batch(
                "CREATE TRIGGER simulate_disk_full BEFORE UPDATE ON library_state
             BEGIN SELECT RAISE(FAIL, 'database or disk is full'); END;",
            )
            .unwrap();
        drop(connection);
        assert!(
            repository
                .save(&json!({"schemaVersion": 1, "works": ["lost"]}), 1)
                .is_err()
        );
        assert_eq!(
            repository.load().unwrap().unwrap().data["works"],
            json!(["safe"])
        );
    }
}
