use std::{fs, io::{Cursor, Read}, path::{Component, Path, PathBuf}};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::Manager;

#[cfg(all(windows, not(debug_assertions)))]
const ARCHIVE: &[u8] = include_bytes!("../../browser-runtime/runtime.zip");
fn archive() -> Result<Vec<u8>, String> {
    #[cfg(all(windows, not(debug_assertions)))] { Ok(ARCHIVE.to_vec()) }
    #[cfg(any(not(windows), debug_assertions))] {
        fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("browser-runtime/runtime.zip")).map_err(|_| "BROWSER_MANAGED_INSTALL:".into())
    }
}
#[derive(Deserialize)]
struct Manifest { version:u32, files:Vec<Entry> }
#[derive(Deserialize)]
struct Entry {path:String,sha256:String,size:u64}
fn digest(bytes:&[u8])->String {format!("{:x}",Sha256::digest(bytes))}
fn child(root:&Path,name:&str)->Result<PathBuf,String> {
    if name.contains(['\\',':']) || name.len()>240 || !Path::new(name).components().all(|part| matches!(part,Component::Normal(_))) || name.is_empty(){return Err("BROWSER_RUNTIME_INTEGRITY:".into())}
    let mut path=root.to_path_buf();
    for part in Path::new(name).components(){path.push(part);if fs::symlink_metadata(&path).is_ok_and(|meta|meta.file_type().is_symlink()){return Err("BROWSER_RUNTIME_INTEGRITY:".into())}}
    Ok(path)
}
pub fn root(app:&tauri::AppHandle)->Result<PathBuf,String>{
    let path=app.path().app_local_data_dir().map_err(|_|"BROWSER_STATE:")?.join("private-browser-v1");
    fs::create_dir_all(&path).map_err(|_|"BROWSER_MANAGED_INSTALL:")?;
    if fs::symlink_metadata(&path).map_err(|_|"BROWSER_STATE:")?.file_type().is_symlink(){return Err("BROWSER_RUNTIME_INTEGRITY:".into())}
    Ok(path)
}
pub fn prepare(base:&Path)->Result<PathBuf,String>{
    let bytes=archive()?;let version=digest(&bytes);
    let directory=child(base,&format!("runtime-{}",&version[..20]))?;
    fs::create_dir_all(&directory).map_err(|_|"BROWSER_MANAGED_INSTALL:")?;
    let mut zip=zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_|"BROWSER_RUNTIME_INTEGRITY:")?;
    let manifest:Manifest=serde_json::from_reader(zip.by_name("manifest.json").map_err(|_|"BROWSER_RUNTIME_INTEGRITY:")?.take(2_000_000)).map_err(|_|"BROWSER_RUNTIME_INTEGRITY:")?;
    if manifest.version!=1 || manifest.files.len()>6000 || manifest.files.iter().map(|file|file.size).sum::<u64>()>256_000_000 {return Err("BROWSER_RUNTIME_INTEGRITY:".into())}
    for file in manifest.files {
        let path=child(&directory,&file.path)?;
        if path.exists(){let current=fs::read(&path).map_err(|_|"BROWSER_RUNTIME_INTEGRITY:")?;if current.len() as u64!=file.size||digest(&current)!=file.sha256{return Err("BROWSER_RUNTIME_INTEGRITY:".into())}continue}
        let mut item=zip.by_name(&file.path).map_err(|_|"BROWSER_RUNTIME_INTEGRITY:")?;
        if item.size()!=file.size||item.unix_mode().is_some_and(|mode|mode&0o170000==0o120000){return Err("BROWSER_RUNTIME_INTEGRITY:".into())}
        let mut data=Vec::new();item.read_to_end(&mut data).map_err(|_|"BROWSER_RUNTIME_INTEGRITY:")?;
        if digest(&data)!=file.sha256{return Err("BROWSER_RUNTIME_INTEGRITY:".into())}
        fs::create_dir_all(path.parent().ok_or("BROWSER_STATE:")?).map_err(|_|"BROWSER_MANAGED_INSTALL:")?;
        use std::io::Write;
        fs::OpenOptions::new().write(true).create_new(true).open(&path).and_then(|mut out|out.write_all(&data)).map_err(|_|"BROWSER_MANAGED_INSTALL:")?;
    }
    Ok(directory)
}

#[cfg(test)]mod tests{
    use super::*;
    #[test]fn extraction_paths_are_strict(){let root=Path::new("owned");for bad in ["../x","a/../../b","/node.exe","C:/node.exe","a\\b",""]{assert!(child(root,bad).is_err(),"{bad}")}assert!(child(root,"engine/main.mjs").is_ok());}
}
