mod policy;
mod state;
mod http;
mod server;
mod result;
mod assets;
mod maintenance;
#[cfg(test)] mod tests;
#[cfg(test)] mod maintenance_tests;
#[cfg(test)] mod transport_tests;

use std::{net::TcpListener, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::{Duration, Instant}};
use chacha20poly1305::aead::rand_core::{OsRng, RngCore};
use serde_json::{Value, json};
use tauri::{AppHandle, State, WebviewWindow};
use crate::repositories::SecretRepository;
use state::{BridgeState, Job, Pair, Request};

#[derive(Default)]
pub struct BrowserRuntime { state: Arc<Mutex<BridgeState>>, listening: AtomicBool, loaded: AtomicBool, prepared:AtomicBool }
fn main_only(window: &WebviewWindow) -> Result<(), String> { if window.label() == "main" { Ok(()) } else { Err("BROWSER_WINDOW:浏览器能力只开放给一隅主窗口".into()) } }
fn random_id() -> String { let mut bytes = [0_u8;32]; OsRng.fill_bytes(&mut bytes); bytes.iter().map(|byte| format!("{byte:02x}")).collect() }
fn start(app: &AppHandle, runtime: &BrowserRuntime) -> Result<(), String> {
    if runtime.listening.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).is_err() { return Ok(()); }
    let listener = match TcpListener::bind(("127.0.0.1", policy::PORT)) { Ok(listener) => listener, Err(_) => { runtime.listening.store(false, Ordering::Release); return Err("BROWSER_PORT:本机连接端口被占用；不会连接其他程序，请关闭占用后重试".into()); } };
    let app = app.clone(); let state = runtime.state.clone(); std::thread::spawn(move || server::serve(app, state, listener)); Ok(())
}
#[tauri::command]
pub fn browser_bridge_configure(window: WebviewWindow, app: AppHandle, runtime: State<'_, BrowserRuntime>, enabled: bool, sites: Vec<String>, cached_login_sites: Option<Vec<String>>,interaction_sites:Option<Vec<String>>) -> Result<Value, String> {
    main_only(&window)?; let sites = policy::sites(&sites)?;
    let cached_login_sites = policy::sites(&cached_login_sites.unwrap_or_default())?;
    if cached_login_sites.iter().any(|site| !sites.contains(site)) { return Err("BROWSER_SITE_PERMISSION:登录授权必须属于已授权网站".into()); }
    let interaction_sites=policy::sites(&interaction_sites.unwrap_or_default())?;
    if interaction_sites.iter().any(|site|!sites.contains(site)){return Err("BROWSER_SITE_PERMISSION:页面操作许可必须属于已授权网站".into())}
    if enabled && !runtime.prepared.load(Ordering::Acquire) {
        let path=assets::prepare(&app,false)?;
        runtime.state.lock().map_err(|_| "BROWSER_STATE:状态不可用")?.extension_path=Some(path);
        runtime.prepared.store(true,Ordering::Release);
    }
    if !runtime.loaded.load(Ordering::Acquire) {
        let pair = SecretRepository::from_app(&app)?.load(server::SECRET_ID)?.map(|raw| serde_json::from_str::<Pair>(&raw).map_err(|_| "BROWSER_PAIR:连接记录损坏，请断开后重新连接")).transpose()?;
        if pair.as_ref().is_some_and(|pair| !policy::extension_origin(&pair.origin) || pair.token.len() != 64 || !pair.token.bytes().all(|byte| byte.is_ascii_hexdigit())) { return Err("BROWSER_PAIR:无效连接记录，请重新连接".into()); }
        runtime.state.lock().map_err(|_| "BROWSER_STATE:状态不可用")?.pair = pair; runtime.loaded.store(true, Ordering::Release);
    }
    { let mut state = runtime.state.lock().map_err(|_| "BROWSER_STATE:状态不可用")?; if state.enabled != enabled || state.sites != sites || state.cached_login_sites != cached_login_sites||state.interaction_sites!=interaction_sites { state.cancel(); } state.enabled = enabled; state.sites = sites; state.cached_login_sites = cached_login_sites;state.interaction_sites=interaction_sites; }
    if enabled { start(&app, &runtime)?; }
    browser_bridge_status(window, runtime)
}
#[tauri::command]
pub fn browser_bridge_status(window: WebviewWindow, runtime: State<'_, BrowserRuntime>) -> Result<Value, String> {
    main_only(&window)?; Ok(runtime.state.lock().map_err(|_| "BROWSER_STATE:状态不可用")?.status())
}
#[tauri::command]
pub fn browser_bridge_connect(window: WebviewWindow, app: AppHandle, runtime: State<'_, BrowserRuntime>) -> Result<Value, String> {
    main_only(&window)?; start(&app, &runtime)?;
    let mut state = runtime.state.lock().map_err(|_| "BROWSER_STATE:状态不可用")?;
    if !state.enabled || state.pair.is_some() { return Err("BROWSER_PAIR:请先开启连接；已配对时应先断开再重新连接".into()); }
    let code = random_id(); state.pending_pair = Some((code.clone(), Instant::now()));
    Ok(json!({"code":code,"expiresInSeconds":600}))
}
#[tauri::command]
pub fn browser_bridge_disconnect(window: WebviewWindow, app: AppHandle, runtime: State<'_, BrowserRuntime>) -> Result<(), String> {
    main_only(&window)?;
    SecretRepository::from_app(&app)?.delete(server::SECRET_ID)?;
    let mut state = runtime.state.lock().map_err(|_| "BROWSER_STATE:状态不可用")?;
    state.cancel(); state.pair = None; state.pending_pair = None; state.last_seen = None; state.reported_sites.clear(); state.extension_version=None; state.extension_revision=None; runtime.loaded.store(true, Ordering::Release); Ok(())
}
pub fn cancel_all(runtime: &BrowserRuntime) { if let Ok(mut state) = runtime.state.lock() { state.cancel(); } }
#[tauri::command]
pub fn browser_bridge_cancel(window: WebviewWindow, runtime: State<'_, BrowserRuntime>) -> Result<(), String> { main_only(&window)?; cancel_all(&runtime); Ok(()) }
#[tauri::command]
pub async fn browser_bridge_request(window: WebviewWindow, runtime: State<'_, BrowserRuntime>, request: Request, expected_epoch: u64) -> Result<Value, String> {
    main_only(&window)?;
    let state = runtime.state.clone();
    tauri::async_runtime::spawn_blocking(move || execute(&state, request, expected_epoch)).await.map_err(|_| "BROWSER_RUNTIME:浏览器任务中断")?
}
fn execute(state: &Mutex<BridgeState>, request: Request, expected_epoch: u64) -> Result<Value, String> {
    let id = random_id(); let epoch;
    {
        let mut state = state.lock().map_err(|_| "BROWSER_STATE:状态不可用")?;
        if state.epoch != expected_epoch { return Err("BROWSER_CANCELLED:授权或停止状态已改变，请重新发起任务".into()); }
        state.check(&request)?;
        if state.last_seen.is_none_or(|time| time.elapsed() >= Duration::from_secs(12)) { return Err("BROWSER_OFFLINE:Edge扩展未在线，请打开已配对的浏览器后再试".into()); }
        if state.job.is_some() { return Err("BROWSER_BUSY:另一项浏览器读取尚未结束".into()); }
        epoch = state.epoch; state.reply = None;
        state.job = Some(Job { id: id.clone(), request, epoch, expires: Instant::now() + Duration::from_secs(45), sent:false });
    }
    loop {
        {
            let mut state = state.lock().map_err(|_| "BROWSER_STATE:状态不可用")?;
            if state.epoch != epoch { return Err("BROWSER_CANCELLED:浏览器读取已停止或授权已改变，迟到结果不再使用".into()); }
            if let Some(reply) = state.reply.take() { state.job = None; return reply; }
            if state.job.as_ref().is_none_or(|job| job.expires <= Instant::now()) { state.cancel(); return Err("BROWSER_TIMEOUT:Edge扩展未响应，请确认浏览器已启动并连接；查询结果未知".into()); }
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}
#[tauri::command]
pub fn browser_bridge_export(window: WebviewWindow, app: AppHandle) -> Result<String, String> { main_only(&window)?; assets::prepare(&app,true) }
#[tauri::command]
pub fn browser_bridge_setup(window: WebviewWindow, runtime: State<'_, BrowserRuntime>, sites:Vec<String>, open_origin:Option<String>) -> Result<Value,String> {
    main_only(&window)?;
    let mut state=runtime.state.lock().map_err(|_| "BROWSER_STATE:状态不可用")?;
    state.request_setup(random_id(),sites,open_origin)?; Ok(state.status())
}
