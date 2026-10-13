use serde::Serialize;
use serde_json::Value;
use super::{http, policy};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveStatus {
    room_url: String, fetched_at_epoch_ms: u64, source_urls: Vec<String>,
    pub status: &'static str, pub reason: String, anchor_name: Option<String>, untrusted: bool,
}

pub fn room_id(raw: &str) -> Result<String, String> {
    let url = policy::public_url(raw)?;
    let id = url.path().trim_matches('/');
    if url.host_str() != Some("live.bilibili.com") || url.query().is_some()
        || id.is_empty() || id.len() > 12 || id.starts_with('0') || !id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("PUBLIC_WEB_ROOM:需要B站官方HTTPS数字直播间链接".into());
    }
    Ok(id.to_string())
}

async fn json(url: &str) -> Result<Value, String> {
    let response = http::fetch(url).await?;
    if response.cached { return Err("公开接口返回了超过30秒的缓存，不能作为当前状态".into()); }
    if response.content_type != "application/json" && !response.content_type.ends_with("+json") { return Err("公开接口未返回JSON".into()); }
    let data: Value = serde_json::from_str(&response.text).map_err(|_| "公开接口返回无效JSON")?;
    if data.get("code").and_then(Value::as_i64) != Some(0) {
        return Err(format!("公开接口未提供状态（code={}），可能需要验证或受限", data.get("code").and_then(Value::as_i64).map(|code| code.to_string()).unwrap_or_else(|| "unknown".into())));
    }
    Ok(data)
}

pub fn verify(room: &Value, master: &Value, requested: u64, name: &str) -> Result<(&'static str, String, u64), String> {
    let room = room.get("data").ok_or("缺少房间资料")?;
    let id = room.get("room_id").and_then(Value::as_u64).filter(|id| *id > 0).ok_or("缺少真实房间号")?;
    let short = room.get("short_id").and_then(Value::as_u64);
    if id != requested && short != Some(requested) { return Err("接口房间号与请求不符".into()); }
    let uid = room.get("uid").and_then(Value::as_u64).filter(|id| *id > 0).ok_or("缺少主播标识")?;
    let data = master.get("data").ok_or("缺少主播资料")?;
    if data.pointer("/info/uid").and_then(Value::as_u64) != Some(uid) || data.get("room_id").and_then(Value::as_u64) != Some(id) {
        return Err("主播标识或所属房间无法核对".into());
    }
    let actual = data.pointer("/info/uname").and_then(Value::as_str).ok_or("缺少主播昵称")?;
    if !actual.trim().eq_ignore_ascii_case(name.trim()) { return Err("接口主播昵称与指定昵称不一致，没有使用同名或相似结果".into()); }
    let status = match room.get("live_status").and_then(Value::as_u64) {
        Some(0) => "offline", Some(1) => "live", Some(2) => "replay", _ => return Err("接口没有明确的开播状态".into()),
    };
    Ok((status, actual.to_string(), id))
}

pub async fn query(raw: &str, name: &str) -> Result<LiveStatus, String> {
    let requested = room_id(raw)?;
    if name.trim().is_empty() || name.chars().count() > 60 { return Err("PUBLIC_WEB_NAME:需要60字以内的准确主播昵称".into()); }
    let source = format!("https://api.live.bilibili.com/room/v1/Room/room_init?id={requested}");
    let mut result = LiveStatus { room_url: format!("https://live.bilibili.com/{requested}"), fetched_at_epoch_ms: http::now_ms(), source_urls: vec![source.clone()], status: "unknown", reason: String::new(), anchor_name: None, untrusted: true };
    let evidence = async {
        let room = json(&source).await?;
        let uid = room.pointer("/data/uid").and_then(Value::as_u64).filter(|id| *id > 0).ok_or("接口缺少主播标识")?;
        let master_url = format!("https://api.live.bilibili.com/live_user/v1/Master/info?uid={uid}");
        result.source_urls.push(master_url.clone());
        let master = json(&master_url).await?;
        verify(&room, &master, requested.parse().map_err(|_| "无效房间号")?, name)
    }.await;
    result.fetched_at_epoch_ms = http::now_ms();
    match evidence {
        Ok((status, actual, id)) => { result.status = status; result.anchor_name = Some(actual); result.room_url = format!("https://live.bilibili.com/{id}"); result.reason = "本次匿名公开接口返回，房间与主播昵称已核对；不是持续监控".into(); }
        Err(reason) => result.reason = reason,
    }
    Ok(result)
}
