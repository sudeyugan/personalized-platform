use rusqlite::Connection;

use super::library_repository::db_error;

const DATABASE_VERSION: i64 = 5;

pub(super) fn migrate(connection: &mut Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                id INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );",
        )
        .map_err(db_error)?;
    let current: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(id), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if current > DATABASE_VERSION {
        return Err(format!(
            "资料库版本 {current} 高于应用支持的版本 {DATABASE_VERSION}"
        ));
    }
    if current < 1 {
        let transaction = connection.transaction().map_err(db_error)?;
        transaction.execute_batch(
            "CREATE TABLE library_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                revision INTEGER NOT NULL,
                schema_version INTEGER NOT NULL,
                data_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            INSERT INTO schema_migrations (id, applied_at) VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));",
        ).map_err(db_error)?;
        transaction.commit().map_err(db_error)?;
    }
    if current < 2 {
        let transaction = connection.transaction().map_err(db_error)?;
        transaction
            .execute_batch(
                "CREATE VIRTUAL TABLE chapter_search USING fts5(
                    chapter_id UNINDEXED,
                    title,
                    plain_text,
                    tokenize = 'unicode61'
                );
                INSERT INTO schema_migrations (id, applied_at) VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));",
            )
            .map_err(db_error)?;
        transaction.commit().map_err(db_error)?;
    }
    if current < 3 {
        let transaction = connection.transaction().map_err(db_error)?;
        transaction
            .execute_batch(
                "DROP TABLE chapter_search;
                CREATE VIRTUAL TABLE chapter_search USING fts5(
                    chapter_id UNINDEXED,
                    title,
                    plain_text,
                    tokenize = 'trigram'
                );
                INSERT INTO schema_migrations (id, applied_at) VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));",
            )
            .map_err(db_error)?;
        transaction.commit().map_err(db_error)?;
    }
    if current < 4 {
        let transaction = connection.transaction().map_err(db_error)?;
        transaction.execute_batch(
            "CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT NOT NULL, data_json TEXT NOT NULL, deleted_at TEXT);
             CREATE TABLE places (id TEXT PRIMARY KEY, name TEXT NOT NULL, data_json TEXT NOT NULL, deleted_at TEXT);
             CREATE TABLE timeline_events (id TEXT PRIMARY KEY, title TEXT NOT NULL, sort_time TEXT, time_precision TEXT NOT NULL, manual_order INTEGER NOT NULL, data_json TEXT NOT NULL, deleted_at TEXT);
             CREATE TABLE person_relations (id TEXT PRIMARY KEY, from_person_id TEXT NOT NULL, to_person_id TEXT NOT NULL, relation_type TEXT NOT NULL, description TEXT NOT NULL, data_json TEXT NOT NULL);
             CREATE TABLE entity_links (id TEXT PRIMARY KEY, source_type TEXT NOT NULL, source_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, relation_type TEXT NOT NULL, anchor_json TEXT, data_json TEXT NOT NULL);
             CREATE INDEX entity_links_source ON entity_links(source_type, source_id);
             CREATE INDEX entity_links_target ON entity_links(target_type, target_id);
             CREATE INDEX timeline_events_sort ON timeline_events(sort_time, manual_order);
             INSERT INTO schema_migrations (id, applied_at) VALUES (4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));"
        ).map_err(db_error)?;
        transaction.commit().map_err(db_error)?;
    }
    if current < 5 {
        let transaction = connection.transaction().map_err(db_error)?;
        transaction.execute_batch(
            "CREATE TABLE assets (id TEXT PRIMARY KEY, file_name TEXT NOT NULL, mime_type TEXT NOT NULL, sha256 TEXT NOT NULL, work_id TEXT, data_json TEXT NOT NULL, deleted_at TEXT);
             CREATE TABLE ai_generations (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, source_id TEXT NOT NULL, status TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL);
             CREATE TABLE permission_grants (id TEXT PRIMARY KEY, principal_type TEXT NOT NULL, principal_id TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, action TEXT NOT NULL, granted_at TEXT NOT NULL, revoked_at TEXT);
             CREATE INDEX assets_work ON assets(work_id);
             CREATE INDEX ai_generations_source ON ai_generations(source_id);
             INSERT INTO schema_migrations (id, applied_at) VALUES (5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));"
        ).map_err(db_error)?;
        transaction.commit().map_err(db_error)?;
    }
    Ok(())
}
