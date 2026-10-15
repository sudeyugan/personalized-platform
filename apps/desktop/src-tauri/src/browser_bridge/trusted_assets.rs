use std::{fs,path::Path};
use sha2::{Digest,Sha256};
pub const FILES:&[(&str,&str)]=&[
    ("manifest.json",include_str!("../../../browser-trusted-click/manifest.json")),
    ("background.js",include_str!("../../../browser-trusted-click/background.js")),
    ("login-engine.js",include_str!("../../../browser-trusted-click/login-engine.js")),
    ("connect.html",include_str!("../../../browser-trusted-click/connect.html")),
    ("connect.js",include_str!("../../../browser-trusted-click/connect.js")),
    ("style.css",include_str!("../../../browser-trusted-click/style.css")),
];
pub fn revision()->String {
    let mut hash=Sha256::new();for(name,body)in FILES{hash.update(name.as_bytes());hash.update([0]);hash.update(body.as_bytes());hash.update([0]);}format!("{:x}",hash.finalize())
}
pub fn write(path:&Path)->Result<(),String>{
    fs::create_dir_all(path).map_err(|_|"BROWSER_EXPORT:不能创建可选组件目录")?;
    let marker=format!("export const TRUSTED_HELPER_REVISION = '{}';\n",revision());
    let mut files=FILES[1..].to_vec();files.push(("revision.js",marker.as_str()));files.push(FILES[0]);
    for(name,body)in files{
        if fs::read(path.join(name)).is_ok_and(|value|value==body.as_bytes()){continue}
        let partial=path.join(format!("{name}.partial"));fs::write(&partial,body).map_err(|_|"BROWSER_EXPORT:不能写入可选组件")?;
        fs::rename(partial,path.join(name)).map_err(|_|"BROWSER_EXPORT:不能更新可选组件，请关闭组件弹窗")?;
    }
    Ok(())
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn trusted_component_is_separate_and_never_added_to_reader_permissions(){
        let reader:serde_json::Value=serde_json::from_str(include_str!("../../../browser-extension/manifest.json")).unwrap();
        for key in ["permissions","optional_permissions"]{assert!(!reader[key].as_array().is_some_and(|values|values.contains(&serde_json::json!("debugger"))))}
        let helper:serde_json::Value=serde_json::from_str(FILES[0].1).unwrap();assert_eq!(helper["permissions"],serde_json::json!(["storage","debugger"]));assert!(helper.get("host_permissions").is_none());
        let dir=tempfile::tempdir().unwrap();write(dir.path()).unwrap();for(name,body)in FILES{assert_eq!(fs::read_to_string(dir.path().join(name)).unwrap(),*body)}
        assert!(fs::read_to_string(dir.path().join("revision.js")).unwrap().contains(&revision()));
    }
}
