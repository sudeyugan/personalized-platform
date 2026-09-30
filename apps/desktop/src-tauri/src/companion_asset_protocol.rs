use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
};

use tauri::{
    http::{
        header::{
            ACCEPT_RANGES, ACCESS_CONTROL_ALLOW_ORIGIN, CACHE_CONTROL, CONTENT_LENGTH,
            CONTENT_RANGE, CONTENT_TYPE, RANGE,
        },
        Request, Response, StatusCode,
    },
    AppHandle, Manager,
};

use crate::{commands::CompanionAssetScope, repositories::AssetRepository};

const MAX_RANGE_BYTES: u64 = 1024 * 1024;

pub fn respond(
    app: &AppHandle,
    webview_label: &str,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    if webview_label != "companion" {
        return empty_response(StatusCode::FORBIDDEN);
    }
    let id = request.uri().path().trim_start_matches('/');
    if id.is_empty() || id.contains('/') {
        return empty_response(StatusCode::BAD_REQUEST);
    }
    let allowed = app
        .state::<CompanionAssetScope>()
        .contains(id)
        .unwrap_or(false);
    if !allowed {
        return empty_response(StatusCode::FORBIDDEN);
    }
    let path =
        match AssetRepository::from_app(app).and_then(|repository| repository.video_path(id)) {
            Ok(path) => path,
            Err(_) => return empty_response(StatusCode::BAD_REQUEST),
        };
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return empty_response(StatusCode::NOT_FOUND);
        }
        Err(_) => return empty_response(StatusCode::INTERNAL_SERVER_ERROR),
    };
    let len = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(_) => return empty_response(StatusCode::INTERNAL_SERVER_ERROR),
    };
    if len == 0 {
        return empty_response(StatusCode::NOT_FOUND);
    }

    let range = request
        .headers()
        .get(RANGE)
        .and_then(|value| value.to_str().ok());
    if request.method() == tauri::http::Method::HEAD {
        return response_builder(StatusCode::OK)
            .header(CONTENT_LENGTH, len)
            .body(Vec::new())
            .unwrap();
    }
    if let Some(value) = range {
        let (start, end) = match parse_range(value, len) {
            Ok(range) => range,
            Err(()) => {
                return response_builder(StatusCode::RANGE_NOT_SATISFIABLE)
                    .header(CONTENT_RANGE, format!("bytes */{len}"))
                    .body(Vec::new())
                    .unwrap();
            }
        };
        let count = end + 1 - start;
        let mut bytes = Vec::with_capacity(count as usize);
        if file.seek(SeekFrom::Start(start)).is_err()
            || file.take(count).read_to_end(&mut bytes).is_err()
        {
            return empty_response(StatusCode::INTERNAL_SERVER_ERROR);
        }
        return response_builder(StatusCode::PARTIAL_CONTENT)
            .header(CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
            .header(CONTENT_LENGTH, bytes.len())
            .body(bytes)
            .unwrap();
    }

    let mut bytes = Vec::with_capacity(len.min(usize::MAX as u64) as usize);
    if file.read_to_end(&mut bytes).is_err() {
        return empty_response(StatusCode::INTERNAL_SERVER_ERROR);
    }
    response_builder(StatusCode::OK)
        .header(CONTENT_LENGTH, bytes.len())
        .body(bytes)
        .unwrap()
}

fn response_builder(status: StatusCode) -> tauri::http::response::Builder {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "video/webm")
        .header(ACCEPT_RANGES, "bytes")
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(CACHE_CONTROL, "no-store")
}

fn empty_response(status: StatusCode) -> Response<Vec<u8>> {
    response_builder(status).body(Vec::new()).unwrap()
}

fn parse_range(value: &str, len: u64) -> Result<(u64, u64), ()> {
    let value = value.strip_prefix("bytes=").ok_or(())?;
    if value.contains(',') {
        return Err(());
    }
    let (start, end) = value.split_once('-').ok_or(())?;
    let (start, requested_end) = if start.is_empty() {
        let suffix = end.parse::<u64>().map_err(|_| ())?;
        if suffix == 0 {
            return Err(());
        }
        (len.saturating_sub(suffix.min(len)), len - 1)
    } else {
        let start = start.parse::<u64>().map_err(|_| ())?;
        let end = if end.is_empty() {
            len - 1
        } else {
            end.parse::<u64>().map_err(|_| ())?.min(len - 1)
        };
        (start, end)
    };
    if start >= len || requested_end < start {
        return Err(());
    }
    Ok((
        start,
        requested_end.min(start.saturating_add(MAX_RANGE_BYTES - 1)),
    ))
}

#[cfg(test)]
mod tests {
    use super::{parse_range, MAX_RANGE_BYTES};

    #[test]
    fn parses_bounded_and_open_ranges() {
        assert_eq!(parse_range("bytes=100-199", 1000), Ok((100, 199)));
        assert_eq!(
            parse_range("bytes=100-", MAX_RANGE_BYTES * 3),
            Ok((100, 100 + MAX_RANGE_BYTES - 1))
        );
    }

    #[test]
    fn parses_suffix_ranges() {
        assert_eq!(parse_range("bytes=-200", 1000), Ok((800, 999)));
        assert_eq!(parse_range("bytes=-2000", 1000), Ok((0, 999)));
    }

    #[test]
    fn rejects_invalid_or_multiple_ranges() {
        assert_eq!(parse_range("items=0-10", 1000), Err(()));
        assert_eq!(parse_range("bytes=1000-", 1000), Err(()));
        assert_eq!(parse_range("bytes=0-1,4-5", 1000), Err(()));
    }
}
