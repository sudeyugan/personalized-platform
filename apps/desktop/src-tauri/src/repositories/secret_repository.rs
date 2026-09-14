use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

pub struct SecretRepository {
    root: PathBuf,
}

impl SecretRepository {
    pub fn from_app(app: &AppHandle) -> Result<Self, String> {
        Ok(Self {
            root: app
                .path()
                .app_data_dir()
                .map_err(|error| format!("无法定位密钥目录：{error}"))?
                .join("secrets"),
        })
    }
    pub fn store(&self, id: &str, secret: &str) -> Result<(), String> {
        validate_id(id)?;
        if secret.is_empty() {
            return Err("SECRET_EMPTY:密钥不能为空".into());
        }
        fs::create_dir_all(&self.root).map_err(io_error)?;
        let protected = protect(secret.as_bytes())?;
        let path = self.root.join(format!("{id}.bin"));
        let partial = self.root.join(format!("{id}.partial"));
        fs::write(&partial, protected).map_err(io_error)?;
        fs::rename(partial, path).map_err(io_error)
    }
    #[cfg(test)]
    pub fn load(&self, id: &str) -> Result<Option<String>, String> {
        validate_id(id)?;
        let path = self.root.join(format!("{id}.bin"));
        if !path.exists() {
            return Ok(None);
        }
        let plain = unprotect(&fs::read(path).map_err(io_error)?)?;
        String::from_utf8(plain)
            .map(Some)
            .map_err(|_| "SECRET_ENCODING:密钥内容损坏".into())
    }
    pub fn has(&self, id: &str) -> Result<bool, String> {
        validate_id(id)?;
        Ok(self.root.join(format!("{id}.bin")).exists())
    }
    pub fn delete(&self, id: &str) -> Result<(), String> {
        validate_id(id)?;
        let path = self.root.join(format!("{id}.bin"));
        if path.exists() {
            fs::remove_file(path).map_err(io_error)?;
        }
        Ok(())
    }
}

fn validate_id(id: &str) -> Result<(), String> {
    if !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        Ok(())
    } else {
        Err("INVALID_SECRET_ID:密钥标识不合法".into())
    }
}
fn io_error(error: std::io::Error) -> String {
    format!("密钥文件操作失败：{error}")
}

#[cfg(windows)]
#[repr(C)]
struct DataBlob {
    size: u32,
    data: *mut u8,
}
#[cfg(windows)]
#[link(name = "Crypt32")]
unsafe extern "system" {
    fn CryptProtectData(
        input: *mut DataBlob,
        description: *const u16,
        entropy: *mut DataBlob,
        reserved: *mut core::ffi::c_void,
        prompt: *mut core::ffi::c_void,
        flags: u32,
        output: *mut DataBlob,
    ) -> i32;
    fn CryptUnprotectData(
        input: *mut DataBlob,
        description: *mut *mut u16,
        entropy: *mut DataBlob,
        reserved: *mut core::ffi::c_void,
        prompt: *mut core::ffi::c_void,
        flags: u32,
        output: *mut DataBlob,
    ) -> i32;
}
#[cfg(windows)]
#[link(name = "Kernel32")]
unsafe extern "system" {
    fn LocalFree(memory: *mut core::ffi::c_void) -> *mut core::ffi::c_void;
}

#[cfg(windows)]
fn protect(input: &[u8]) -> Result<Vec<u8>, String> {
    crypt(input, true)
}
#[cfg(windows)]
#[cfg(test)]
fn unprotect(input: &[u8]) -> Result<Vec<u8>, String> {
    crypt(input, false)
}
#[cfg(windows)]
fn crypt(input: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    let mut owned = input.to_vec();
    let mut source = DataBlob {
        size: owned.len() as u32,
        data: owned.as_mut_ptr(),
    };
    let mut output = DataBlob {
        size: 0,
        data: std::ptr::null_mut(),
    };
    let success = unsafe {
        if encrypt {
            CryptProtectData(
                &mut source,
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                1,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &mut source,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                1,
                &mut output,
            )
        }
    };
    if success == 0 {
        return Err(format!(
            "DPAPI_ERROR:Windows 密钥保护失败：{}",
            std::io::Error::last_os_error()
        ));
    }
    let result = unsafe { std::slice::from_raw_parts(output.data, output.size as usize).to_vec() };
    unsafe {
        LocalFree(output.data.cast());
    }
    Ok(result)
}

#[cfg(not(windows))]
fn protect(_: &[u8]) -> Result<Vec<u8>, String> {
    Err("DPAPI_UNAVAILABLE:当前平台不支持 Windows 密钥保护".into())
}
#[cfg(not(windows))]
fn unprotect(_: &[u8]) -> Result<Vec<u8>, String> {
    Err("DPAPI_UNAVAILABLE:当前平台不支持 Windows 密钥保护".into())
}

#[cfg(all(test, windows))]
mod tests {
    use super::SecretRepository;
    use tempfile::tempdir;
    #[test]
    fn dpapi_secret_round_trip_leaves_no_plaintext() {
        let directory = tempdir().unwrap();
        let repository = SecretRepository {
            root: directory.path().join("secrets"),
        };
        repository
            .store("ai-provider", "unique-secret-marker")
            .unwrap();
        let raw = std::fs::read(directory.path().join("secrets/ai-provider.bin")).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("unique-secret-marker"));
        assert_eq!(
            repository.load("ai-provider").unwrap().as_deref(),
            Some("unique-secret-marker")
        );
    }
}
