use super::storage_root;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;

static AUDIO_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioReceipt {
    pub id: String,
    pub file_name: String,
    pub mime_type: String,
    pub size: usize,
    pub sha256: String,
}

pub struct AudioRepository {
    root: PathBuf,
}
impl AudioRepository {
    pub fn from_app(app: &AppHandle) -> Result<Self, String> {
        Ok(Self {
            root: storage_root(app)?.join("audio"),
        })
    }
    pub fn import(
        &self,
        file_name: &str,
        mime_type: &str,
        bytes: &[u8],
    ) -> Result<AudioReceipt, String> {
        if bytes.is_empty() || bytes.len() > 200 * 1024 * 1024 {
            return Err("AUDIO_SIZE_INVALID:音频必须小于 200 MB".into());
        }
        let extension = extension(mime_type)?;
        let id = new_id();
        fs::create_dir_all(&self.root).map_err(io_error)?;
        let path = self.root.join(format!("{id}.{extension}"));
        let partial = self.root.join(format!("{id}.{extension}.partial"));
        fs::write(&partial, bytes).map_err(io_error)?;
        fs::rename(partial, path).map_err(io_error)?;
        Ok(AudioReceipt {
            id,
            file_name: sanitize_name(file_name),
            mime_type: mime_type.into(),
            size: bytes.len(),
            sha256: format!("{:X}", Sha256::digest(bytes)),
        })
    }
    pub fn read(&self, id: &str, mime_type: &str) -> Result<Vec<u8>, String> {
        validate_id(id)?;
        fs::read(self.root.join(format!("{id}.{}", extension(mime_type)?))).map_err(io_error)
    }
    pub fn delete(&self, id: &str, mime_type: &str) -> Result<(), String> {
        validate_id(id)?;
        let path = self.root.join(format!("{id}.{}", extension(mime_type)?));
        if path.exists() {
            fs::remove_file(path).map_err(io_error)?;
        }
        Ok(())
    }
}
fn extension(mime: &str) -> Result<&'static str, String> {
    match mime {
        "audio/mpeg" => Ok("mp3"),
        "audio/wav" | "audio/x-wav" => Ok("wav"),
        "audio/ogg" => Ok("ogg"),
        "audio/mp4" | "audio/x-m4a" => Ok("m4a"),
        "audio/flac" => Ok("flac"),
        _ => Err("AUDIO_TYPE_INVALID:仅支持 MP3、WAV、OGG、M4A 和 FLAC".into()),
    }
}
fn new_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let seq = AUDIO_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("track-{nanos:x}-{seq:x}")
}
fn validate_id(id: &str) -> Result<(), String> {
    if id.starts_with("track-") && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        Ok(())
    } else {
        Err("INVALID_TRACK_ID:音频标识不合法".into())
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
fn io_error(error: std::io::Error) -> String {
    format!("音频文件操作失败：{error}")
}

#[cfg(test)]
mod tests {
    use super::AudioRepository;
    use tempfile::tempdir;
    #[test]
    fn imports_reads_and_deletes_audio_safely() {
        let dir = tempdir().unwrap();
        let repo = AudioRepository {
            root: dir.path().join("audio"),
        };
        let r = repo.import("夜曲.mp3", "audio/mpeg", b"audio").unwrap();
        assert_eq!(repo.read(&r.id, "audio/mpeg").unwrap(), b"audio");
        repo.delete(&r.id, "audio/mpeg").unwrap();
        assert!(repo.read(&r.id, "audio/mpeg").is_err());
    }
    #[test]
    fn rejects_unsafe_identifiers_and_types() {
        let dir = tempdir().unwrap();
        let repo = AudioRepository {
            root: dir.path().join("audio"),
        };
        assert!(
            repo.import("x.exe", "application/octet-stream", b"x")
                .is_err()
        );
        assert!(repo.read("../secret", "audio/mpeg").is_err());
    }
}
