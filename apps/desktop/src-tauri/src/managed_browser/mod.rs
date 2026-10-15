mod assets;
mod job;
mod worker;
mod policy;
#[cfg(test)]mod integration_tests;
use std::sync::{Arc,Mutex,atomic::{AtomicU64,Ordering}};
use serde_json::{Value,json};
use tauri::{AppHandle,State,WebviewWindow};
use crate::browser_bridge::{state::Request,result};
use worker::Worker;

#[derive(Default)]pub struct ManagedBrowserRuntime {inner:Arc<Runtime>}
#[derive(Default)]struct Runtime{config:Mutex<policy::Config>,worker:Mutex<Option<Worker>>,epoch:AtomicU64}
fn main_only(window:&WebviewWindow)->Result<(),String>{if window.label()=="main"{Ok(())}else{Err("BROWSER_WINDOW:".into())}}
pub fn cancel_all(runtime:&ManagedBrowserRuntime){
    runtime.inner.epoch.fetch_add(1,Ordering::SeqCst);
    if let Ok(mut worker)=runtime.inner.worker.try_lock(){*worker=None;}
}
fn status(runtime:&Runtime)->Result<Value,String>{
    let config=runtime.config.lock().map_err(|_|"BROWSER_STATE:")?;
    let login=runtime.worker.try_lock().is_ok_and(|worker|worker.as_ref().is_some_and(|worker|worker.login));
    Ok(json!({"enabled":config.enabled,"paired":config.enabled,"online":config.enabled,"sites":config.sites,"browserSites":config.sites,"epoch":runtime.epoch.load(Ordering::SeqCst),"mode":if login{"login"}else{"background"},"backend":"managed"}))
}
#[tauri::command]
pub fn managed_browser_status(window:WebviewWindow,runtime:State<'_,ManagedBrowserRuntime>)->Result<Value,String>{main_only(&window)?;status(&runtime.inner)}
#[tauri::command]
pub fn managed_browser_configure(window:WebviewWindow,runtime:State<'_,ManagedBrowserRuntime>,enabled:bool,sites:Vec<String>,interaction_sites:Vec<String>)->Result<Value,String>{
    main_only(&window)?;
    let next=policy::Config::new(enabled,sites,interaction_sites)?;
    {let mut config=runtime.inner.config.lock().map_err(|_|"BROWSER_STATE:")?;if *config!=next{*config=next;cancel_all(&runtime);}}
    status(&runtime.inner)
}
#[tauri::command]
pub fn managed_browser_cancel(window:WebviewWindow,runtime:State<'_,ManagedBrowserRuntime>)->Result<(),String>{main_only(&window)?;cancel_all(&runtime);Ok(())}
#[tauri::command]
pub async fn managed_browser_clear_session(app:AppHandle,window:WebviewWindow,runtime:State<'_,ManagedBrowserRuntime>,confirmed:bool)->Result<(),String>{
    main_only(&window)?;if !confirmed{return Err("BROWSER_ARGUMENT:".into())}cancel_all(&runtime);let runtime=runtime.inner.clone();
    tauri::async_runtime::spawn_blocking(move||{
        let mut worker=runtime.worker.lock().map_err(|_|"BROWSER_STATE:")?;*worker=None;
        let path=assets::root(&app)?.join("profile");
        if let Ok(metadata)=std::fs::symlink_metadata(&path){
            if !metadata.is_dir()||metadata.file_type().is_symlink(){return Err("BROWSER_RUNTIME_INTEGRITY:".into())}
            std::fs::remove_dir_all(&path).map_err(|_|"BROWSER_STATE:".to_string())?;
        }Ok(())
    }).await.map_err(|_|"BROWSER_RUNTIME:".to_string())?
}
fn execute(app:&AppHandle,runtime:&Runtime,expected:u64,command:Value)->Result<Value,String>{
    let config=runtime.config.lock().map_err(|_|"BROWSER_STATE:")?.clone();
    if !config.enabled{return Err("BROWSER_DISABLED:".into())}
    if runtime.epoch.load(Ordering::SeqCst)!=expected{return Err("BROWSER_CANCELLED:".into())}
    let mut slot=runtime.worker.try_lock().map_err(|_|"BROWSER_BUSY:")?;
    let result=(||{
        if slot.is_none(){
            let root=assets::root(app)?;let directory=assets::prepare(&root)?;let profile=root.join("profile");
            std::fs::create_dir_all(&profile).map_err(|_|"BROWSER_STATE:")?;
            if std::fs::symlink_metadata(&profile).map_err(|_|"BROWSER_STATE:")?.file_type().is_symlink(){return Err("BROWSER_RUNTIME_INTEGRITY:".into())}
            let mut worker=Worker::start(&directory,&profile)?;
            worker.call(json!({"kind":"configure","sites":config.sites,"interactions":config.interactions}),&runtime.epoch,expected)?;
            *slot=Some(worker);
        }
        let worker=slot.as_mut().ok_or("BROWSER_STATE:")?;
        let output=worker.call(command.clone(),&runtime.epoch,expected)?;
        if command["kind"]=="login"{worker.login=true;}else if command["kind"]=="finish"||command["kind"]=="request"{worker.login=false;}
        if runtime.epoch.load(Ordering::SeqCst)!=expected{return Err("BROWSER_CANCELLED:".into())}Ok(output)
    })();
    // Broken/cancelled workers cannot leave stale output or browser instances.
    if result.as_ref().is_err_and(|error:&String|!["BROWSER_LOGIN_ACTIVE:","BROWSER_STALE:","BROWSER_ARGUMENT:","BROWSER_SITE_PERMISSION:"].contains(&error.as_str())){*slot=None;}
    result
}
#[tauri::command]
pub async fn managed_browser_request(app:AppHandle,window:WebviewWindow,runtime:State<'_,ManagedBrowserRuntime>,request:Request,expected_epoch:u64)->Result<Value,String>{
    main_only(&window)?;
    runtime.inner.config.lock().map_err(|_|"BROWSER_STATE:")?.check(&request)?;
    let runtime=runtime.inner.clone();
    tauri::async_runtime::spawn_blocking(move||{
        let data=execute(&app,&runtime,expected_epoch,json!({"kind":"request","request":request}))?;
        result::validate_managed(&request,data)
    }).await.map_err(|_|"BROWSER_RUNTIME:".to_string())?
}
#[tauri::command]
pub async fn managed_browser_login(app:AppHandle,window:WebviewWindow,runtime:State<'_,ManagedBrowserRuntime>,origin:String,url:String,expected_epoch:u64)->Result<Value,String>{
    main_only(&window)?;
    {let config=runtime.inner.config.lock().map_err(|_|"BROWSER_STATE:")?;if !config.enabled||!config.sites.contains(&origin){return Err("BROWSER_SITE_PERMISSION:".into())}policy::entry(&url,&origin)?;}
    let runtime=runtime.inner.clone();
    tauri::async_runtime::spawn_blocking(move||execute(&app,&runtime,expected_epoch,json!({"kind":"login","origin":origin,"url":url}))).await.map_err(|_|"BROWSER_RUNTIME:".to_string())?
}
#[tauri::command]
pub async fn managed_browser_finish_login(app:AppHandle,window:WebviewWindow,runtime:State<'_,ManagedBrowserRuntime>,expected_epoch:u64)->Result<Value,String>{
    main_only(&window)?;let runtime=runtime.inner.clone();
    tauri::async_runtime::spawn_blocking(move||execute(&app,&runtime,expected_epoch,json!({"kind":"finish"}))).await.map_err(|_|"BROWSER_RUNTIME:".to_string())?
}
