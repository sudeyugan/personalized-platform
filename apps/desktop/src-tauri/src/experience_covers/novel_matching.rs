use super::CoverCandidate;

pub(super) fn normalized(value: &str) -> String {
    value.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect()
}
pub(super) fn input(query: &str, creator: &str) -> (String, String) {
    let clean: String = query.chars().filter(|c| !matches!(c, '\u{200b}' | '\u{feff}')).map(|c| {
        if ('\u{ff01}'..='\u{ff5e}').contains(&c) { char::from_u32(c as u32 - 0xfee0).unwrap_or(c) } else { c }
    }).collect();
    let clean = clean.trim();
    let mut title = clean.to_string();
    let mut author = creator.trim().to_string();
    if clean.starts_with('《') {
        if let Some(end) = clean.find('》') {
            title = clean['《'.len_utf8()..end].trim().into();
            if author.is_empty() { author = clean[end + '》'.len_utf8()..].trim().trim_start_matches(['-', '—', ' ', ':', '：']).trim_start_matches("作者").trim_start_matches([':', '：', ' ']).trim_end_matches('著').trim().into(); }
        }
    } else if let Some((name, by)) = clean.split_once("作者:").or_else(|| clean.split_once("作者：")) {
        title = name.trim().into();
        if author.is_empty() { author = by.trim().trim_end_matches('著').trim().into(); }
    }
    title = title.trim_matches(['《', '》', '“', '”', '"']).trim().into();
    if !title.chars().any(|c| c.is_ascii_alphanumeric()) { title.retain(|c| !c.is_whitespace()); }
    (title, author.chars().take(100).collect())
}
pub(super) fn score(candidate: &CoverCandidate, query: &str, creator: &str) -> i32 {
    let title = normalized(query);
    let name = normalized(&candidate.title);
    let author = normalized(&candidate.creator);
    let hint = normalized(creator);
    let exact = !name.is_empty() && (title == name || (!author.is_empty() && title == format!("{name}{author}")));
    let renamed = candidate.matched_title.as_ref().is_some_and(|old| normalized(old) == title);
    let partial = name.chars().count() >= 2 && title.chars().count() >= 2 && (name.contains(&title) || title.contains(&name));
    (if exact { 100 } else if renamed { 80 } else if partial { 30 } else { 0 })
        + if hint.is_empty() || author.is_empty() { 0 } else if author == hint { 20 } else { -40 }
}
pub(super) fn rank(candidates: &mut [CoverCandidate], query: &str, creator: &str) {
    candidates.sort_by_key(|candidate| std::cmp::Reverse(score(candidate, query, creator)));
}
pub(super) fn finish(mut candidates: Vec<CoverCandidate>, query: &str, creator: &str) -> Vec<CoverCandidate> {
    candidates.retain(|candidate| score(candidate, query, "") > 0 && !candidate.source_url.starts_with("https://fanqienovel.com/keyword/"));
    rank(&mut candidates, query, creator);
    let mut seen = std::collections::HashSet::new();
    candidates.retain(|candidate| seen.insert(candidate.source_url.clone()));
    candidates.truncate(6);
    candidates
}
