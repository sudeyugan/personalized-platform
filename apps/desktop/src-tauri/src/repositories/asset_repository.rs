use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::AppHandle;

use super::storage_root;

static ASSET_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetReceipt {
    pub id: String,
    pub file_name: String,
    pub mime_type: String,
    pub size: usize,
    pub sha256: String,
}

pub struct AssetRepository {
    root: PathBuf,
}

impl AssetRepository {
    pub fn from_app(app: &AppHandle) -> Result<Self, String> {
        Ok(Self {
            root: storage_root(app)?.join("assets"),
        })
    }

    pub fn import_image(
        &self,
        file_name: &str,
        mime_type: &str,
        bytes: &[u8],
        thumbnail: &[u8],
    ) -> Result<AssetReceipt, String> {
        if bytes.is_empty() || bytes.len() > 25 * 1024 * 1024 {
            return Err("IMAGE_SIZE_INVALID:图片必须小于 25 MB".into());
        }
        let extension = match mime_type {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            _ => return Err("IMAGE_TYPE_INVALID:仅支持 JPG、PNG 和 WebP".into()),
        };
        if thumbnail.len() > 2 * 1024 * 1024 {
            return Err("THUMBNAIL_SIZE_INVALID:缩略图过大".into());
        }
        let id = new_id();
        let images = self.root.join("images");
        let thumbnails = self.root.join("thumbnails");
        fs::create_dir_all(&images).map_err(io_error)?;
        fs::create_dir_all(&thumbnails).map_err(io_error)?;
        write_atomic(&images.join(format!("{id}.{extension}")), bytes)?;
        if !thumbnail.is_empty() {
            write_atomic(&thumbnails.join(format!("{id}.webp")), thumbnail)?;
        }
        Ok(AssetReceipt {
            id,
            file_name: sanitize_name(file_name),
            mime_type: mime_type.into(),
            size: bytes.len(),
            sha256: format!("{:X}", Sha256::digest(bytes)),
        })
    }

    pub fn import_video(
        &self,
        file_name: &str,
        mime_type: &str,
        bytes: &[u8],
    ) -> Result<AssetReceipt, String> {
        if mime_type != "video/webm" {
            return Err("VIDEO_TYPE_INVALID:动态伙伴仅支持 WebM".into());
        }
        if bytes.is_empty() || bytes.len() > 200 * 1024 * 1024 {
            return Err("VIDEO_SIZE_INVALID:WebM 必须小于 200 MB".into());
        }
        let id = new_id();
        let videos = self.root.join("videos");
        fs::create_dir_all(&videos).map_err(io_error)?;
        write_atomic(&videos.join(format!("{id}.webm")), bytes)?;
        Ok(AssetReceipt {
            id,
            file_name: sanitize_name(file_name),
            mime_type: mime_type.into(),
            size: bytes.len(),
            sha256: format!("{:X}", Sha256::digest(bytes)),
        })
    }

    pub fn read(&self, id: &str, mime_type: &str, thumbnail: bool) -> Result<Vec<u8>, String> {
        validate_id(id)?;
        let extension = if thumbnail {
            "webp"
        } else {
            match mime_type {
                "image/jpeg" => "jpg",
                "image/png" => "png",
                "image/webp" => "webp",
                "video/webm" => "webm",
                _ => return Err("IMAGE_TYPE_INVALID:未知图片类型".into()),
            }
        };
        let directory = if thumbnail { "thumbnails" } else if mime_type == "video/webm" { "videos" } else { "images" };
        fs::read(self.root.join(directory).join(format!("{id}.{extension}"))).map_err(io_error)
    }

    pub fn delete(&self, id: &str, mime_type: &str) -> Result<(), String> {
        validate_id(id)?;
        let extension = match mime_type {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            "video/webm" => "webm",
            _ => return Err("IMAGE_TYPE_INVALID:未知图片类型".into()),
        };
        let directory = if mime_type == "video/webm" { "videos" } else { "images" };
        for path in [
            self.root.join(directory).join(format!("{id}.{extension}")),
            self.root.join("thumbnails").join(format!("{id}.webp")),
        ] {
            if path.exists() {
                fs::remove_file(path).map_err(io_error)?;
            }
        }
        Ok(())
    }
}

fn new_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let sequence = ASSET_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("asset-{nanos:x}-{sequence:x}")
}
fn validate_id(id: &str) -> Result<(), String> {
    if id.starts_with("asset-") && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        Ok(())
    } else {
        Err("INVALID_ASSET_ID:素材标识不合法".into())
    }
}
fn sanitize_name(name: &str) -> String {
    name.chars()
        .filter(|c| !"<>:\"/\\|?*".contains(*c) && !c.is_control())
        .take(120)
        .collect::<String>()
        .trim()
        .to_string()
}
fn write_atomic(path: &PathBuf, bytes: &[u8]) -> Result<(), String> {
    let partial = path.with_extension(format!(
        "{}partial",
        path.extension().and_then(|v| v.to_str()).unwrap_or("")
    ));
    fs::write(&partial, bytes).map_err(io_error)?;
    fs::rename(partial, path).map_err(io_error)
}
fn io_error(error: std::io::Error) -> String {
    format!("素材文件操作失败：{error}")
}

#[cfg(test)]
mod tests {
    use super::AssetRepository;
    use tempfile::tempdir;

    #[test]
    fn imports_reads_and_deletes_without_using_original_path() {
        let directory = tempdir().unwrap();
        let repository = AssetRepository {
            root: directory.path().join("assets"),
        };
        let receipt = repository
            .import_image("旧照片.png", "image/png", b"image-bytes", b"thumb")
            .unwrap();
        assert_eq!(
            repository.read(&receipt.id, "image/png", false).unwrap(),
            b"image-bytes"
        );
        repository.delete(&receipt.id, "image/png").unwrap();
        assert!(repository.read(&receipt.id, "image/png", false).is_err());
    }
}
