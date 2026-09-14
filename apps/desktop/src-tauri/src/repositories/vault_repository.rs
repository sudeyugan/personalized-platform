use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

use argon2::Argon2;
use chacha20poly1305::{
    XChaCha20Poly1305, XNonce,
    aead::{
        Aead, KeyInit,
        rand_core::{OsRng, RngCore},
    },
};
use serde_json::Value;
use tauri::AppHandle;

use super::storage_root;

const MAGIC: &[u8; 8] = b"YIYUVLT1";
struct CachedKey {
    key: [u8; 32],
    expires: Instant,
}
static KEYS: OnceLock<Mutex<HashMap<String, CachedKey>>> = OnceLock::new();
fn keys() -> &'static Mutex<HashMap<String, CachedKey>> {
    KEYS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub struct VaultRepository {
    root: PathBuf,
}
impl VaultRepository {
    pub fn from_app(app: &AppHandle) -> Result<Self, String> {
        Ok(Self {
            root: storage_root(app)?.join("vaults"),
        })
    }
    pub fn create(
        &self,
        id: &str,
        password: &str,
        payload: &Value,
        ttl_minutes: u64,
    ) -> Result<(), String> {
        validate(id, password)?;
        fs::create_dir_all(&self.root).map_err(io_error)?;
        let mut salt = [0u8; 16];
        OsRng.fill_bytes(&mut salt);
        let key = derive(password, &salt)?;
        self.write(id, &salt, &key, payload)?;
        cache(id, key, ttl_minutes);
        Ok(())
    }
    pub fn unlock(&self, id: &str, password: &str, ttl_minutes: u64) -> Result<Value, String> {
        validate(id, password)?;
        let bytes = fs::read(self.path(id)).map_err(io_error)?;
        let (salt, nonce, ciphertext) = parts(&bytes)?;
        let key = derive(password, salt)?;
        let plain = XChaCha20Poly1305::new((&key).into())
            .decrypt(XNonce::from_slice(nonce), ciphertext)
            .map_err(|_| "VAULT_PASSWORD:密码错误或加密文件已被篡改")?;
        let payload = serde_json::from_slice(&plain)
            .map_err(|error| format!("VAULT_PAYLOAD:加密内容损坏：{error}"))?;
        cache(id, key, ttl_minutes);
        Ok(payload)
    }
    pub fn save(&self, id: &str, payload: &Value, ttl_minutes: u64) -> Result<(), String> {
        validate_id(id)?;
        let bytes = fs::read(self.path(id)).map_err(io_error)?;
        let (salt, _, _) = parts(&bytes)?;
        let salt = *<&[u8; 16]>::try_from(salt).map_err(|_| "VAULT_FORMAT:盐值损坏")?;
        let mut guard = keys()
            .lock()
            .map_err(|_| "VAULT_KEY_CACHE:密钥缓存不可用")?;
        let cached = guard.get_mut(id).ok_or("VAULT_LOCKED:作品已经锁定")?;
        if Instant::now() >= cached.expires {
            guard.remove(id);
            return Err("VAULT_LOCKED:作品已经自动锁定".into());
        }
        let key = cached.key;
        cached.expires = Instant::now() + Duration::from_secs(ttl_minutes.max(1) * 60);
        drop(guard);
        self.write(id, &salt, &key, payload)
    }
    pub fn is_unlocked(&self, id: &str) -> Result<bool, String> {
        validate_id(id)?;
        let mut guard = keys()
            .lock()
            .map_err(|_| "VAULT_KEY_CACHE:密钥缓存不可用")?;
        let valid = guard
            .get(id)
            .is_some_and(|item| Instant::now() < item.expires);
        if !valid {
            guard.remove(id);
        }
        Ok(valid)
    }
    pub fn lock(&self, id: &str) -> Result<(), String> {
        validate_id(id)?;
        keys()
            .lock()
            .map_err(|_| "VAULT_KEY_CACHE:密钥缓存不可用")?
            .remove(id);
        Ok(())
    }
    pub fn lock_all(&self) -> Result<(), String> {
        keys()
            .lock()
            .map_err(|_| "VAULT_KEY_CACHE:密钥缓存不可用")?
            .clear();
        Ok(())
    }
    fn path(&self, id: &str) -> PathBuf {
        self.root.join(id).join("vault.bin")
    }
    fn write(
        &self,
        id: &str,
        salt: &[u8; 16],
        key: &[u8; 32],
        payload: &Value,
    ) -> Result<(), String> {
        let directory = self.root.join(id);
        fs::create_dir_all(&directory).map_err(io_error)?;
        let mut nonce = [0u8; 24];
        OsRng.fill_bytes(&mut nonce);
        let plain =
            serde_json::to_vec(payload).map_err(|error| format!("VAULT_SERIALIZE:{error}"))?;
        let ciphertext = XChaCha20Poly1305::new(key.into())
            .encrypt(XNonce::from_slice(&nonce), plain.as_ref())
            .map_err(|_| "VAULT_ENCRYPT:无法加密作品")?;
        let mut output = Vec::with_capacity(48 + ciphertext.len());
        output.extend_from_slice(MAGIC);
        output.extend_from_slice(salt);
        output.extend_from_slice(&nonce);
        output.extend_from_slice(&ciphertext);
        let path = self.path(id);
        let partial = directory.join("vault.partial");
        fs::write(&partial, output).map_err(io_error)?;
        fs::rename(partial, path).map_err(io_error)
    }
}
fn parts(bytes: &[u8]) -> Result<(&[u8], &[u8], &[u8]), String> {
    if bytes.len() < 49 || &bytes[..8] != MAGIC {
        return Err("VAULT_FORMAT:不是有效的一隅加密 vault".into());
    }
    Ok((&bytes[8..24], &bytes[24..48], &bytes[48..]))
}
fn derive(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|error| format!("VAULT_KDF:{error}"))?;
    Ok(key)
}
fn cache(id: &str, key: [u8; 32], ttl: u64) {
    if let Ok(mut guard) = keys().lock() {
        guard.insert(
            id.into(),
            CachedKey {
                key,
                expires: Instant::now() + Duration::from_secs(ttl.max(1) * 60),
            },
        );
    }
}
fn validate(id: &str, password: &str) -> Result<(), String> {
    validate_id(id)?;
    if password.chars().count() < 8 {
        return Err("VAULT_PASSWORD_LENGTH:密码至少需要 8 个字符".into());
    }
    Ok(())
}
fn validate_id(id: &str) -> Result<(), String> {
    if id.starts_with("vault-") && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        Ok(())
    } else {
        Err("INVALID_VAULT_ID:加密容器标识不合法".into())
    }
}
fn io_error(error: std::io::Error) -> String {
    format!("加密容器文件操作失败：{error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;
    #[test]
    fn vault_rejects_wrong_password_and_contains_no_plaintext() {
        let dir = tempdir().unwrap();
        let repo = VaultRepository {
            root: dir.path().join("vaults"),
        };
        repo.create(
            "vault-test",
            "correct-password",
            &json!({"title":"unique-private-title","body":"unique-private-body"}),
            15,
        )
        .unwrap();
        repo.lock("vault-test").unwrap();
        let raw = fs::read(dir.path().join("vaults/vault-test/vault.bin")).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("unique-private"));
        assert!(repo.unlock("vault-test", "wrong-password", 15).is_err());
        assert_eq!(
            repo.unlock("vault-test", "correct-password", 15).unwrap()["body"],
            "unique-private-body"
        );
    }
}
