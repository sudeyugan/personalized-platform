use std::{net::TcpListener, sync::{Arc, Mutex, atomic::{AtomicUsize, Ordering}}, time::Instant};
use serde_json::{Value, json};
use tauri::AppHandle;
use crate::repositories::SecretRepository;
use super::{http, policy, state::{BridgeState, Pair}, result};

pub const SECRET_ID: &str = "browser-bridge-pair-v1";
pub fn serve(app: AppHandle, state: Arc<Mutex<BridgeState>>, listener: TcpListener) {
    let clients = Arc::new(AtomicUsize::new(0));
    for incoming in listener.incoming() {
        let Ok(mut stream) = incoming else { continue; };
        if clients.fetch_add(1, Ordering::AcqRel) >= 8 { clients.fetch_sub(1, Ordering::AcqRel); continue; }
        let clients = clients.clone(); let app = app.clone(); let state = state.clone();
        std::thread::spawn(move || {
            match http::receive(&mut stream) {
                Ok(request) => { let origin = request.origin.clone(); let reply = handle(&app, &state, request); http::respond(&mut stream, Some(&origin), reply); },
                Err(error) => http::respond(&mut stream, None, Err(error)),
            }
            clients.fetch_sub(1, Ordering::AcqRel);
        });
    }
}
fn handle(app: &AppHandle, state: &Mutex<BridgeState>, request: http::HttpRequest) -> Result<Value, String> {
    let mut state = state.lock().map_err(|_| "BROWSER_STATE:连接状态不可用")?;
    if request.method == "OPTIONS" { return Ok(json!({"ok":true})); }
    if request.path == "/pair" {
        let code = request.body.get("code").and_then(Value::as_str).ok_or("BROWSER_PAIR:缺少连接码")?;
        state.check_pair(code)?;
        let pair = Pair { token: code.into(), origin: request.origin };
        SecretRepository::from_app(app)?.store(SECRET_ID, &serde_json::to_string(&pair).map_err(|_| "BROWSER_PAIR:保存连接失败")?)?;
        state.pair = Some(pair); state.pending_pair = None; state.cancel();
        return Ok(json!({"paired":true}));
    }
    authenticated_request(&mut state, request)
}
// Keep authenticated protocol dispatch independently exercisable through the
// actual TCP parser, rather than a mock bridge accepting nonexistent routes.
pub(super) fn authenticated_request(state: &mut BridgeState, request: http::HttpRequest) -> Result<Value, String> {
    state.authenticate(&request.origin, &request.token)?;
    match request.path.as_str() {
        "/active" => {
            let id = request.body.get("id").and_then(Value::as_str).ok_or("BROWSER_ARGUMENT:缺少请求ID")?;
            let active=state.active_job(id);
            if active{state.last_seen=Some(Instant::now())}
            Ok(json!({"active":active}))
        },
        "/poll" => {
            let values: Vec<String> = serde_json::from_value(request.body.get("sites").cloned().ok_or("BROWSER_ARGUMENT:缺少网站授权")?).map_err(|_| "BROWSER_ARGUMENT:无效网站授权")?;
            let sites=policy::sites(&values)?;
            let version=request.body.get("version").map(|value| value.as_str().map(str::to_owned).ok_or("BROWSER_ARGUMENT:无效扩展版本")).transpose()?;
            state.report_version(version)?;
            let revision=request.body.get("revision").map(|value| value.as_str().map(str::to_owned).ok_or("BROWSER_ARGUMENT:无效扩展内容标记")).transpose()?;
            state.report_revision(revision)?;
            Ok(state.poll(sites))
        },
        "/setup" => state.setup_reply(serde_json::from_value(request.body).map_err(|_| "BROWSER_ARGUMENT:无效设置回执")?),
        "/reply" => {
            let id = request.body.get("id").and_then(Value::as_str).ok_or("BROWSER_ARGUMENT:缺少请求ID")?;
            let job = state.job.clone().filter(|job| job.id == id && job.sent && job.epoch == state.epoch && job.expires > Instant::now()).ok_or("BROWSER_STALE:当前请求已停止或结果过期")?;
            if state.reply.is_some() { return Err("BROWSER_REPLAY:结果已经接收".into()); }
            state.check(&job.request)?;
            let reply = if request.body.get("ok") == Some(&Value::Bool(true)) {
                result::validate(&job.request, request.body.get("data").cloned().ok_or("BROWSER_RESULT:缺少结果")?)
            } else {
                let code = request.body.get("error").and_then(Value::as_str).unwrap_or("failed");
                Err(match code { "login" => "BROWSER_LOGIN:Edge当前账号登录已失效，请手动登录后再试", "permission" => "BROWSER_SITE_PERMISSION:Edge网站授权已撤销", "tab_changed" => "BROWSER_TAB_CHANGED:标签页已切换或跳转，请重新观察", "timeout" => "BROWSER_TIMEOUT:网站读取超时，当前状态无法确认", "page_pending" => "BROWSER_PAGE_PENDING:页面尚未加载完成", "page_open" => "BROWSER_PAGE_OPEN:未能打开授权页面", "page_access" => "BROWSER_PAGE_ACCESS:浏览器拒绝当前页面读取", _ => "BROWSER_READ_FAILED:页面或官方只读接口暂不可用，不能确认查询结果" }.into())
            };
            state.reply = Some(reply); Ok(json!({"accepted":true}))
        },
        _ => Err("BROWSER_HTTP:未知请求".into()),
    }
}
