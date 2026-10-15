use std::fs;
use std::sync::{LazyLock, Mutex};
use sha2::{Digest,Sha256};
use tauri::{AppHandle, Manager};

static WRITING: Mutex<()> = Mutex::new(());
static VERSION: LazyLock<String> = LazyLock::new(|| serde_json::from_str::<serde_json::Value>(include_str!("../../../browser-extension/manifest.json")).expect("embedded extension manifest")["version"].as_str().expect("extension version").to_owned());
pub fn version() -> &'static str { VERSION.as_str() }
const FILES: &[(&str,&str)] = &[
    ("background.js", include_str!("../../../browser-extension/background.js")),
    ("failure.js", include_str!("../../../browser-extension/failure.js")),
    ("maintenance.js", include_str!("../../../browser-extension/maintenance.js")),
    ("setup.html", include_str!("../../../browser-extension/setup.html")),
    ("setup.js", include_str!("../../../browser-extension/setup.js")),
    ("readers.js", include_str!("../../../browser-extension/readers.js")),
    ("page.js", include_str!("../../../browser-extension/page.js")),
    ("recording.js", include_str!("../../../browser-extension/recording.js")),
    ("recording-page.js", include_str!("../../../browser-extension/recording-page.js")),
    ("query-window.js", include_str!("../../../browser-extension/query-window.js")),
    ("query-window-state.js", include_str!("../../../browser-extension/query-window-state.js")),
    ("query-host.html", include_str!("../../../browser-extension/query-host.html")),
    ("login.js", include_str!("../../../browser-extension/login.js")),
    ("login-form.js", include_str!("../../../browser-extension/login-form.js")),
    ("trusted-login.js", include_str!("../../../browser-extension/trusted-login.js")),
    ("trusted-helper-id.js", include_str!("../../../browser-extension/trusted-helper-id.js")),
    ("controls.js", include_str!("../../../browser-extension/controls.js")),
    ("task-driver.js", include_str!("../../../browser-extension/task-driver.js")),
    ("policy.js", include_str!("../../../browser-extension/policy.js")),
    ("popup.html", include_str!("../../../browser-extension/popup.html")),
    ("popup.js", include_str!("../../../browser-extension/popup.js")),
    ("trusted-login-permission.js", include_str!("../../../browser-extension/trusted-login-permission.js")),
    ("popup.css", include_str!("../../../browser-extension/popup.css")),
    ("manifest.json", include_str!("../../../browser-extension/manifest.json")),
];
static REVISION: LazyLock<String> = LazyLock::new(|| {
    let mut hash=Sha256::new();for (name,body) in FILES { hash.update(name.as_bytes());hash.update([0]);hash.update(body.as_bytes());hash.update([0]); }hash.update(super::trusted_assets::revision().as_bytes());format!("{:x}",hash.finalize())
});
pub fn revision() -> &'static str { REVISION.as_str() }
pub fn prepare(app: &AppHandle, reveal: bool) -> Result<String, String> {
    let _guard = WRITING.lock().map_err(|_| "BROWSER_EXPORT:扩展更新状态不可用")?;
    let path = app.path().app_data_dir().map_err(|_| "BROWSER_EXPORT:找不到应用目录")?.join("edge-extension");
    write_files(&path)?;
    let helper=path.with_file_name("edge-trusted-click");if helper.exists(){super::trusted_assets::write(&helper)?;}
    #[cfg(windows)] if reveal { let _ = std::process::Command::new("explorer.exe").arg(&path).spawn(); }
    #[cfg(not(windows))] let _ = reveal;
    Ok(path.to_string_lossy().to_string())
}
pub fn prepare_trusted(app:&AppHandle)->Result<String,String>{
    let _guard=WRITING.lock().map_err(|_|"BROWSER_EXPORT:扩展更新状态不可用")?;
    let path=app.path().app_data_dir().map_err(|_|"BROWSER_EXPORT:找不到应用目录")?.join("edge-trusted-click");
    super::trusted_assets::write(&path)?;
    #[cfg(windows)]{let _=std::process::Command::new("explorer.exe").arg(&path).spawn();}
    Ok(path.to_string_lossy().to_string())
}
fn write_files(path:&std::path::Path)->Result<(),String>{
    fs::create_dir_all(&path).map_err(|_| "BROWSER_EXPORT:不能创建扩展目录")?;
    let marker=format!("export const EXTENSION_REVISION = '{}';\n",revision());
    let helper_marker=format!("export const TRUSTED_HELPER_REVISION = '{}';\n",super::trusted_assets::revision());
    // Update the content marker and manifest last. Any packaged file change
    // triggers reload, even if the manifest's protocol version is unchanged.
    let mut files=FILES[..FILES.len()-1].to_vec();files.push(("trusted-helper-revision.js",helper_marker.as_str()));files.push(("revision.js",marker.as_str()));files.push(FILES[FILES.len()-1]);
    for (name, body) in files {
        if fs::read(path.join(name)).is_ok_and(|current| current == body.as_bytes()) { continue; }
        let partial = path.join(format!("{name}.partial")); fs::write(&partial, body).map_err(|_| "BROWSER_EXPORT:不能写入扩展文件")?;
        fs::rename(&partial, path.join(name)).map_err(|_| "BROWSER_EXPORT:不能更新扩展文件；请先关闭扩展弹窗")?;
    }
    Ok(())
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn packaged_files_are_complete_and_content_marker_matches_native_revision(){
        let dir=tempfile::tempdir().unwrap();write_files(dir.path()).unwrap();
        for(name,body)in FILES{assert_eq!(fs::read_to_string(dir.path().join(name)).unwrap(),*body);}
        assert_eq!(revision().len(),64);assert!(fs::read_to_string(dir.path().join("revision.js")).unwrap().contains(revision()));
        fs::write(dir.path().join("page.js"),"old fixture").unwrap();write_files(dir.path()).unwrap();assert_eq!(fs::read_to_string(dir.path().join("page.js")).unwrap(),include_str!("../../../browser-extension/page.js"));
        assert_eq!(serde_json::from_str::<serde_json::Value>(&fs::read_to_string(dir.path().join("manifest.json")).unwrap()).unwrap()["version"],version());
    }
    #[test] fn failed_resource_update_never_publishes_a_new_manifest_or_content_marker(){
        let dir=tempfile::tempdir().unwrap();fs::write(dir.path().join("manifest.json"),"old fixture manifest").unwrap();fs::write(dir.path().join("revision.js"),"old fixture revision").unwrap();
        fs::create_dir(dir.path().join("setup.js.partial")).unwrap();assert!(write_files(dir.path()).is_err());
        assert_eq!(fs::read_to_string(dir.path().join("manifest.json")).unwrap(),"old fixture manifest");assert_eq!(fs::read_to_string(dir.path().join("revision.js")).unwrap(),"old fixture revision");
    }
}
