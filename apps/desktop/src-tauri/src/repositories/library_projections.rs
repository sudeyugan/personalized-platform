use rusqlite::{Transaction, params};
use serde_json::Value;

use super::library_repository::db_error;

pub(super) fn refresh_search_index(
    transaction: &Transaction<'_>,
    value: &Value,
) -> Result<(), String> {
    transaction
        .execute("DELETE FROM chapter_search", [])
        .map_err(db_error)?;
    let Some(chapters) = value.get("chapters").and_then(Value::as_object) else {
        return Ok(());
    };
    for (chapter_id, chapter) in chapters {
        if chapter
            .get("deletedAt")
            .is_some_and(|deleted| !deleted.is_null())
        {
            continue;
        }
        transaction
            .execute(
                "INSERT INTO chapter_search (chapter_id, title, plain_text) VALUES (?1, ?2, ?3)",
                params![
                    chapter_id,
                    text(chapter, "title"),
                    text(chapter, "plainText")
                ],
            )
            .map_err(db_error)?;
    }
    Ok(())
}

pub(super) fn refresh_record_projections(
    transaction: &Transaction<'_>,
    value: &Value,
) -> Result<(), String> {
    transaction.execute_batch("DELETE FROM ai_generations; DELETE FROM assets; DELETE FROM entity_links; DELETE FROM person_relations; DELETE FROM timeline_events; DELETE FROM places; DELETE FROM people;").map_err(db_error)?;
    for person in value
        .get("people")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        transaction
            .execute(
                "INSERT INTO people (id, name, data_json, deleted_at) VALUES (?1, ?2, ?3, ?4)",
                params![
                    text(person, "id"),
                    text(person, "name"),
                    person.to_string(),
                    optional_text(person, "deletedAt")
                ],
            )
            .map_err(db_error)?;
    }
    for place in value
        .get("places")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        transaction
            .execute(
                "INSERT INTO places (id, name, data_json, deleted_at) VALUES (?1, ?2, ?3, ?4)",
                params![
                    text(place, "id"),
                    text(place, "name"),
                    place.to_string(),
                    optional_text(place, "deletedAt")
                ],
            )
            .map_err(db_error)?;
    }
    for event in value
        .get("events")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        transaction.execute("INSERT INTO timeline_events (id, title, sort_time, time_precision, manual_order, data_json, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", params![text(event, "id"), text(event, "title"), optional_text(event, "sortTime").or_else(|| optional_text(event, "startDate")), text(event, "precision"), event.get("manualOrder").and_then(Value::as_i64).unwrap_or(0), event.to_string(), optional_text(event, "deletedAt")]).map_err(db_error)?;
    }
    for relation in value
        .get("personRelations")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        transaction.execute("INSERT INTO person_relations (id, from_person_id, to_person_id, relation_type, description, data_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![text(relation, "id"), text(relation, "fromPersonId"), text(relation, "toPersonId"), text(relation, "relationType"), text(relation, "description"), relation.to_string()]).map_err(db_error)?;
    }
    for link in value
        .get("entityLinks")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        transaction.execute("INSERT INTO entity_links (id, source_type, source_id, target_type, target_id, relation_type, anchor_json, data_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)", params![text(link, "id"), text(link, "sourceType"), text(link, "sourceId"), text(link, "targetType"), text(link, "targetId"), text(link, "relationType"), link.get("anchor").filter(|value| !value.is_null()).map(Value::to_string), link.to_string()]).map_err(db_error)?;
    }
    for asset in value
        .get("assets")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        transaction.execute("INSERT INTO assets (id, file_name, mime_type, sha256, work_id, data_json, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", params![text(asset,"id"),text(asset,"fileName"),text(asset,"mimeType"),text(asset,"sha256"),optional_text(asset,"workId"),asset.to_string(),optional_text(asset,"deletedAt")]).map_err(db_error)?;
    }
    for generation in value
        .get("aiGenerations")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        transaction.execute("INSERT INTO ai_generations (id, provider_id, source_id, status, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![text(generation,"id"),text(generation,"providerId"),text(generation,"sourceId"),text(generation,"status"),generation.to_string(),text(generation,"createdAt")]).map_err(db_error)?;
    }
    Ok(())
}

fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}
fn optional_text(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}
