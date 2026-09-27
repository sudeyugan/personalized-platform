use serde_json::Value;

pub fn validate_library(data: &Value) -> Result<(), String> {
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
    if !data.get("chapters").is_some_and(Value::is_object) {
        return Err("资料库 chapters 字段无效".to_owned());
    }
    if !data.get("assets").is_some_and(Value::is_array) {
        return Err("资料库 assets 字段无效".to_owned());
    }
    Ok(())
}
