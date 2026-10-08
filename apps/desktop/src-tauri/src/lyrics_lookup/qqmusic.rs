//! Anonymous regular LRC only: no cookies, login, audio URLs, QRC or player-cache decryption.
//! Protocol reference: WXRIW/Lyricify-Lyrics-Helper (Providers/Web/QQMusic).
use base64::{Engine, engine::general_purpose::STANDARD};
use reqwest::Client;
use serde::Deserialize;
use super::{matching::{LyricsResult, RemoteLyrics, identity, normalize}, transport::{RequestContext, read}};

#[derive(Deserialize)]
struct Singer { name: String }
#[derive(Deserialize)]
struct Album { name: String }
#[derive(Deserialize)]
struct Song { mid: String, title: String, singer: Vec<Singer>, album: Album, interval: f64 }
fn candidate(data: &[u8], title: &str, artist: &str, album: &str, duration: f64) -> Result<Option<String>, String> {
    let json: serde_json::Value = serde_json::from_slice(data).map_err(|_| "LYRICS_INVALID_RESPONSE")?;
    if json["code"].as_i64() != Some(0) || json["req_1"]["code"].as_i64() != Some(0) { return Err("LYRICS_SOURCE_UNAVAILABLE".into()); }
    let list = json["req_1"]["data"]["body"]["song"]["list"].as_array().ok_or("LYRICS_INVALID_RESPONSE")?;
    if list.len() > 10 { return Err("LYRICS_INVALID_RESPONSE".into()); }
    let mut matches = Vec::new();
    for value in list {
        let Ok(song) = serde_json::from_value::<Song>(value.clone()) else { continue; };
        if song.mid.is_empty() || song.mid.len() > 64 || !song.mid.bytes().all(|b| b.is_ascii_alphanumeric())
            || song.singer.is_empty() || song.singer.len() > 10 { continue; }
        let recording = RemoteLyrics { track_name: song.title, artist_name: song.singer.into_iter().map(|s| s.name).collect::<Vec<_>>().join("/"),
            album_name: song.album.name, duration: song.interval, synced_lyrics: None, instrumental: false };
        if identity(&recording, title, artist, duration) { matches.push((song.mid, recording.album_name)); }
    }
    if !album.trim().is_empty() && matches.iter().any(|(_, name)| normalize(name) == normalize(album)) {
        matches.retain(|(_, name)| normalize(name) == normalize(album));
    }
    matches.sort(); matches.dedup_by(|a, b| a.0 == b.0);
    if matches.len() > 1 { return Err("LYRICS_AMBIGUOUS".into()); }
    Ok(matches.pop().map(|(mid, _)| mid))
}
pub(super) fn has_timing(lrc: &str) -> bool {
    lrc.lines().any(|line| {
        let Some((time, text)) = line.strip_prefix('[').and_then(|s| s.split_once(']')) else { return false; };
        let Some((minutes, seconds)) = time.split_once(':') else { return false; };
        let (Ok(minutes), Ok(seconds)) = (minutes.parse::<u32>(), seconds.parse::<f64>()) else { return false; };
        minutes <= 60 && seconds.is_finite() && (0.0..60.0).contains(&seconds) && !text.trim().is_empty()
    })
}
fn parse_lrc(data: &[u8]) -> Result<LyricsResult, String> {
    let text = std::str::from_utf8(data).map_err(|_| "LYRICS_INVALID_RESPONSE")?.trim();
    // Parse only the exact JSONP wrapper, never evaluate source text.
    let json = if text.starts_with('{') { text } else {
        text.strip_prefix("MusicJsonCallback_lrc(").and_then(|s| s.trim_end_matches(';').strip_suffix(')')).ok_or("LYRICS_INVALID_RESPONSE")?
    };
    let value: serde_json::Value = serde_json::from_str(json).map_err(|_| "LYRICS_INVALID_RESPONSE")?;
    if value["code"].as_i64() != Some(0) { return Err("LYRICS_SOURCE_UNAVAILABLE".into()); }
    let Some(encoded) = value["lyric"].as_str().filter(|s| !s.is_empty()) else { return Ok(LyricsResult::empty("unsynced", "qqmusic")); };
    if encoded.len() > 800_000 { return Err("LYRICS_TOO_LARGE".into()); }
    let bytes = STANDARD.decode(encoded).map_err(|_| "LYRICS_INVALID_RESPONSE")?;
    let lrc = String::from_utf8(bytes).map_err(|_| "LYRICS_INVALID_RESPONSE")?;
    if lrc.chars().count() > 200_000 { return Err("LYRICS_TOO_LARGE".into()); }
    if !has_timing(&lrc) { return Ok(LyricsResult::empty("unsynced", "qqmusic")); }
    Ok(LyricsResult { lrc, instrumental: false, outcome: "matched", source: "qqmusic" })
}
pub(super) async fn lookup(client: &Client, ctx: &RequestContext<'_>, title: &str, artist: &str, album: &str, duration: f64) -> Result<LyricsResult, String> {
    let payload = serde_json::json!({ "req_1": { "method": "DoSearchForQQMusicDesktop", "module": "music.search.SearchCgiService",
        "param": { "num_per_page": 10, "page_num": 1, "query": format!("{title} {artist}"), "search_type": 0 } } });
    let data = read(client.post("https://u.y.qq.com/cgi-bin/musicu.fcg").json(&payload), ctx, true).await?;
    let Some(data) = data else { return Ok(LyricsResult::empty("not-found", "qqmusic")); };
    let mid = match candidate(&data, title, artist, album, duration) {
        Ok(Some(mid)) => mid,
        Ok(None) => return Ok(LyricsResult::empty("not-found", "qqmusic")),
        Err(error) if error == "LYRICS_AMBIGUOUS" => return Ok(LyricsResult::empty("ambiguous", "qqmusic")),
        Err(error) => return Err(error),
    };
    let form = [
        ("songmid", mid.as_str()), ("callback", "MusicJsonCallback_lrc"), ("jsonpCallback", "MusicJsonCallback_lrc"),
        ("g_tk", "5381"), ("loginUin", "0"), ("hostUin", "0"), ("format", "jsonp"),
        ("inCharset", "utf8"), ("outCharset", "utf8"), ("notice", "0"), ("platform", "yqq"), ("needNewCode", "0"),
    ];
    let data = read(client.post("https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg")
        .header(reqwest::header::REFERER, "https://c.y.qq.com/").form(&form), ctx, true).await?;
    data.map(|bytes| parse_lrc(&bytes)).unwrap_or_else(|| Ok(LyricsResult::empty("not-found", "qqmusic")))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn search(songs: serde_json::Value) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({ "code": 0, "req_1": { "code": 0, "data": { "body": { "song": { "list": songs } } } } })).unwrap()
    }
    fn song(mid: &str, title: &str) -> serde_json::Value {
        serde_json::json!({ "mid": mid, "title": title, "singer": [{"name": "川川南"}], "album": {"name": "现场"}, "interval": 320 })
    }
    #[test] fn exact_live_not_accompaniment_or_original_or_alias() {
        let data = search(serde_json::json!([song("original", "河流"), song("backing", "河流 (Live|伴奏)"), song("live", "河流 (Live)")]));
        assert_eq!(candidate(&data, "河流（live）", "川川南", "收藏", 320.8).unwrap(), Some("live".into()));
        assert_eq!(candidate(&data, "河流（live）", "川川", "收藏", 320.0).unwrap(), None);
        assert_eq!(candidate(&data, "河流（live）", "川川南", "收藏", 330.0).unwrap(), None);
    }
    #[test] fn refuse_ambiguous_ids_invalid_mid_and_choose_matching_album() {
        let a = song("one", "河流 (Live)"); let mut b = song("two", "河流 (Live)"); b["album"]["name"] = "重发行".into();
        let data = search(serde_json::json!([a, b]));
        assert!(candidate(&data, "河流 (Live)", "川川南", "", 320.0).is_err());
        assert_eq!(candidate(&data, "河流 (Live)", "川川南", "现场", 320.0).unwrap(), Some("one".into()));
        assert_eq!(candidate(&search(serde_json::json!([song("../url", "河流 (Live)")])), "河流 (Live)", "川川南", "", 320.0).unwrap(), None);
    }
    fn lyric(text: &str) -> String {
        format!("MusicJsonCallback_lrc({});", serde_json::json!({"code":0,"lyric":STANDARD.encode(text)}))
    }
    #[test] fn decode_regular_lrc_without_evaluating_jsonp() {
        assert_eq!(parse_lrc(lyric("[00:01.25]Test line").as_bytes()).unwrap().source, "qqmusic");
        assert_eq!(parse_lrc(lyric("Plain text only").as_bytes()).unwrap().outcome, "unsynced");
        assert!(parse_lrc(b"evil({});MusicJsonCallback_lrc({});").is_err());
        assert!(parse_lrc(br#"{"code":0,"lyric":"??"}"#).is_err());
        assert!(!has_timing("[00:99]invalid"));
        assert!(parse_lrc(lyric(&"x".repeat(200_001)).as_bytes()).is_err());
    }
}
