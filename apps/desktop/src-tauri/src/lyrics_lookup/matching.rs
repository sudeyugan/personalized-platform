use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemoteLyrics {
    pub track_name: String, pub artist_name: String, pub album_name: String, pub duration: f64,
    pub synced_lyrics: Option<String>, #[serde(default)] pub instrumental: bool,
}
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResult { pub lrc: String, pub instrumental: bool, pub outcome: &'static str, pub source: &'static str }
impl LyricsResult {
    pub(super) fn empty(outcome: &'static str, source: &'static str) -> Self {
        Self { lrc: String::new(), instrumental: false, outcome, source }
    }
}
pub(super) fn normalize(text: &str) -> String {
    text.chars().map(|c| if ('\u{ff01}'..='\u{ff5e}').contains(&c) {
        char::from_u32(c as u32 - 0xfee0).unwrap_or(c)
    } else { c }).flat_map(char::to_lowercase).filter(|c| c.is_alphanumeric()).collect()
}
fn artists(text: &str) -> Vec<String> {
    let mut names: Vec<_> = text.split(['/', ',', '&', ';', '、', '，', '；']).map(normalize).filter(|s| !s.is_empty()).collect();
    names.sort(); names.dedup(); names
}
pub(super) fn identity(value: &RemoteLyrics, title: &str, artist: &str, duration: f64) -> bool {
    normalize(&value.track_name) == normalize(title)
        && (normalize(&value.artist_name) == normalize(artist) || artists(&value.artist_name) == artists(artist))
        && value.duration.is_finite() && (value.duration - duration).abs() <= 2.0
}
pub(super) fn select(values: Vec<RemoteLyrics>, title: &str, artist: &str, album: &str, duration: f64) -> Result<LyricsResult, String> {
    let matches: Vec<_> = values.into_iter().filter(|v| identity(v, title, artist, duration)).collect();
    let has_plain = !matches.is_empty();
    let mut usable: Vec<_> = matches.into_iter().filter(|v| v.instrumental || v.synced_lyrics.as_ref().is_some_and(|s| !s.trim().is_empty())).collect();
    if usable.iter().any(|v| v.synced_lyrics.as_ref().is_some_and(|s| s.chars().count() > 200_000)) { return Err("LYRICS_TOO_LARGE".into()); }
    // Album is a preference, not recording identity: compilations rename the same recording.
    if !album.trim().is_empty() && usable.iter().any(|v| normalize(&v.album_name) == normalize(album)) {
        usable.retain(|v| normalize(&v.album_name) == normalize(album));
    }
    let Some(first) = usable.first() else { return Ok(LyricsResult::empty(if has_plain { "unsynced" } else { "not-found" }, "lrclib")); };
    // Never pick an arbitrary result when timing/lyrics differ between eligible recordings.
    if usable.iter().any(|v| v.synced_lyrics != first.synced_lyrics || v.instrumental != first.instrumental) {
        return Ok(LyricsResult::empty("ambiguous", "lrclib"));
    }
    let value = usable.remove(0);
    Ok(LyricsResult { lrc: value.synced_lyrics.unwrap_or_default(), instrumental: value.instrumental, outcome: "matched", source: "lrclib" })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn recording(title: &str, artist: &str, album: &str) -> RemoteLyrics {
        serde_json::from_value(serde_json::json!({ "trackName": title, "artistName": artist, "albumName": album, "duration": 180.0, "syncedLyrics": "[00:01]Line", "instrumental": false })).unwrap()
    }
    #[test] fn punctuation_and_compilation_do_not_reject_same_live_recording() {
        assert_eq!(select(vec![recording("河流 (Live)", "歌手", "演唱会")], "河流（live）", "歌手", "收藏", 180.8).unwrap().outcome, "matched");
        assert_eq!(select(vec![recording("Hello", "Adele, Adele", "25")], "Hello", "Adele", "精选", 180.0).unwrap().outcome, "matched");
    }
    #[test] fn protect_live_artist_and_duration_identity() {
        for (title, artist, duration) in [("Song (Live)", "Singer", 180.0), ("Song", "Other", 180.0), ("Song", "Singer", 190.0)] {
            assert_eq!(select(vec![recording("Song", "Singer", "Album")], title, artist, "Album", duration).unwrap().outcome, "not-found");
        }
        let mut value = recording("Song", "Singer", "Album"); value.duration = f64::NAN;
        assert_eq!(select(vec![value], "Song", "Singer", "Album", 180.0).unwrap().outcome, "not-found");
    }
    #[test] fn ambiguous_versions_need_confirmation_and_album_disambiguates() {
        let a = recording("Song", "Singer", "A"); let mut b = recording("Song", "Singer", "B"); b.synced_lyrics = Some("[00:02]Other".into());
        assert_eq!(select(vec![a, b], "Song", "Singer", "C", 180.0).unwrap().outcome, "ambiguous");
        let a = recording("Song", "Singer", "A"); let mut b = recording("Song", "Singer", "B"); b.synced_lyrics = Some("[00:02]Other".into());
        assert_eq!(select(vec![a, b], "Song", "Singer", "A", 180.0).unwrap().lrc, "[00:01]Line");
    }
    #[test] fn plain_lyrics_are_not_reported_as_synced_and_oversize_is_rejected() {
        let mut plain = recording("Song", "Singer", "A"); plain.synced_lyrics = None;
        assert_eq!(select(vec![plain], "Song", "Singer", "A", 180.0).unwrap().outcome, "unsynced");
        let mut huge = recording("Song", "Singer", "A"); huge.synced_lyrics = Some("x".repeat(200_001));
        assert!(select(vec![huge], "Song", "Singer", "A", 180.0).is_err());
    }
}
