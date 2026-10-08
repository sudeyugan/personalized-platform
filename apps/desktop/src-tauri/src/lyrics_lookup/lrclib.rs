use reqwest::Client;
use super::{matching::{LyricsResult, RemoteLyrics, select}, transport::{RequestContext, read}};

fn search_title(title: &str) -> &str {
    title.find(['(', '（', '[']).map(|i| title[..i].trim()).filter(|s| !s.is_empty()).unwrap_or(title.trim())
}
pub(super) async fn lookup(client: &Client, ctx: &RequestContext<'_>, title: &str, artist: &str, album: &str, duration: f64) -> Result<LyricsResult, String> {
    let duration_text = duration.to_string();
    let mut query = vec![("track_name", title), ("artist_name", artist), ("duration", &duration_text)];
    if !album.trim().is_empty() { query.push(("album_name", album)); }
    if let Some(data) = read(client.get("https://lrclib.net/api/get").query(&query), ctx, false).await? {
        let value: RemoteLyrics = serde_json::from_slice(&data).map_err(|_| "LYRICS_INVALID_RESPONSE")?;
        let result = select(vec![value], title, artist, album, duration)?;
        if result.outcome == "matched" { return Ok(result); }
    }
    tauri::async_runtime::spawn_blocking(|| std::thread::sleep(std::time::Duration::from_millis(300)))
        .await.map_err(|_| "LYRICS_REQUEST_FAILED")?;
    let data = read(client.get("https://lrclib.net/api/search").query(&[
        ("track_name", search_title(title)), ("artist_name", artist.split(['/', '&', ';', '、', '；']).next().unwrap_or(artist))
    ]), ctx, false).await?.unwrap_or_else(|| b"[]".to_vec());
    let values: Vec<RemoteLyrics> = serde_json::from_slice(&data).map_err(|_| "LYRICS_INVALID_RESPONSE")?;
    if values.len() > 20 { return Err("LYRICS_INVALID_RESPONSE".into()); }
    select(values, title, artist, album, duration)
}
