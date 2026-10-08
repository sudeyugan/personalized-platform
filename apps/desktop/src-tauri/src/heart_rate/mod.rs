#[cfg(target_os = "windows")]
mod windows_ble;
mod measurement;

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}},
    time::Instant,
};
use tauri::{State, WebviewWindow};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    id: String,
    name: String,
    #[serde(skip)]
    address: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartRateStatus {
    phase: String,
    bpm: Option<u16>,
    age_ms: Option<u64>,
    device_name: Option<String>,
    devices: Vec<Device>,
    message: String,
}

impl Default for HeartRateStatus {
    fn default() -> Self {
        Self { phase: "off".into(), bpm: None, age_ms: None, device_name: None,
            devices: vec![], message: "心率连接已关闭".into() }
    }
}

#[derive(Default)]
struct Inner {
    generation: u64,
    cancel: Arc<AtomicBool>,
    status: HeartRateStatus,
    received: Option<Instant>,
    devices: BTreeMap<u64, Device>,
}

#[derive(Clone, Default)]
pub struct HeartRateRuntime {
    inner: Arc<Mutex<Inner>>,
    worker: Arc<Mutex<()>>,
}

fn require_main(label: &str) -> Result<(), String> {
    if label == "main" { Ok(()) } else { Err("WINDOW_CAPABILITY_DENIED:心率设备只能由主窗口管理".into()) }
}

// Stable for the same advertised address; a scoped identifier, not device authentication.
// Raw addresses stay native. Connections still require the current scan's allowlist.
fn device_id(address: u64) -> String {
    let mut hash = Sha256::new();
    hash.update(b"yiyu-heart-rate-device-v1");
    hash.update(address.to_be_bytes());
    format!("hr-{:x}", hash.finalize())
}

impl HeartRateRuntime {
    fn update(&self, generation: u64, change: impl FnOnce(&mut Inner)) {
        if let Ok(mut inner) = self.inner.lock() {
            if inner.generation == generation && !inner.cancel.load(Ordering::SeqCst) { change(&mut inner); }
        }
    }
    fn status(&self) -> Result<HeartRateStatus, String> {
        let inner = self.inner.lock().map_err(|_| "心率状态暂不可用")?;
        let mut status = inner.status.clone();
        status.devices = inner.devices.values().cloned().collect();
        status.age_ms = inner.received.map(|at| at.elapsed().as_millis().min(u64::MAX as u128) as u64);
        if status.age_ms.is_some_and(|age| age > 10_000) {
            status.bpm = None;
            if status.phase == "connected" { status.message = "心率数据已过期，请检查手表广播".into(); }
        }
        Ok(status)
    }
    fn begin(&self, phase: &str) -> Result<(u64, Arc<AtomicBool>), String> {
        let mut inner = self.inner.lock().map_err(|_| "心率状态暂不可用")?;
        if ["scanning", "connecting", "connected"].contains(&inner.status.phase.as_str()) {
            return Err("请先停止当前连接或扫描".into());
        }
        inner.cancel.store(true, Ordering::SeqCst);
        inner.generation += 1;
        inner.cancel = Arc::new(AtomicBool::new(false));
        inner.received = None;
        inner.status.bpm = None;
        inner.status.age_ms = None;
        inner.status.device_name = None;
        inner.status.phase = phase.into();
        inner.status.message = if phase == "scanning" { "正在查找心率广播（约8秒）" } else { "正在连接，请保持手表广播开启" }.into();
        Ok((inner.generation, inner.cancel.clone()))
    }
    fn fail(&self, generation: u64, message: &str) {
        self.update(generation, |inner| {
            inner.status.phase = "error".into();
            inner.status.message = message.into();
            inner.status.bpm = None;
            inner.received = None;
        });
    }
    fn discover(&self, generation: u64, address: u64, name: String) {
        self.update(generation, |inner| {
            if inner.devices.len() >= 32 && !inner.devices.contains_key(&address) { return; }
            let id = device_id(address);
            inner.devices.entry(address).or_insert(Device { id, name, address });
        });
    }
    fn receive(&self, generation: u64, bytes: &[u8]) {
        let bpm = measurement::parse(bytes);
        self.update(generation, |inner| {
            // 无接触/无效读数立刻清除，不继续显示上一条心率。
            inner.status.bpm = bpm;
            inner.received = bpm.map(|_| Instant::now());
            inner.status.message = if bpm.is_some() { "实时心率 · 仅本地显示" } else { "暂无有效读数，请检查佩戴" }.into();
        });
    }
}

#[tauri::command]
pub fn heart_rate_status(window: WebviewWindow, runtime: State<'_, HeartRateRuntime>) -> Result<HeartRateStatus, String> {
    require_main(window.label())?;
    runtime.status()
}

#[tauri::command]
pub fn heart_rate_scan(window: WebviewWindow, runtime: State<'_, HeartRateRuntime>) -> Result<HeartRateStatus, String> {
    require_main(window.label())?;
    let (generation, cancel) = runtime.begin("scanning")?;
    runtime.update(generation, |inner| inner.devices.clear());
    let worker = runtime.inner().clone();
    std::thread::spawn(move || {
        let _guard = match worker.worker.lock() { Ok(guard) => guard, Err(_) => { worker.fail(generation, "心率工作线程暂不可用"); return; } };
        if cancel.load(Ordering::SeqCst) { return; }
        #[cfg(target_os = "windows")]
        if windows_ble::scan(&worker, generation, &cancel).is_err() {
            worker.fail(generation, "无法扫描蓝牙：请开启电脑蓝牙与手表心率广播，并检查 Windows 蓝牙权限");
        }
        #[cfg(not(target_os = "windows"))]
        worker.fail(generation, "当前仅支持 Windows 本地蓝牙连接");
    });
    runtime.status()
}

#[tauri::command]
pub fn heart_rate_connect(window: WebviewWindow, runtime: State<'_, HeartRateRuntime>, device_id: String) -> Result<HeartRateStatus, String> {
    require_main(window.label())?;
    let device = runtime.inner.lock().map_err(|_| "心率状态暂不可用")?.devices.values().find(|device| device.id == device_id).cloned().ok_or("设备不在本次扫描列表，请重新扫描")?;
    let (generation, cancel) = runtime.begin("connecting")?;
    runtime.update(generation, |inner| inner.status.device_name = Some(device.name.clone()));
    let worker = runtime.inner().clone();
    std::thread::spawn(move || {
        let _guard = match worker.worker.lock() { Ok(guard) => guard, Err(_) => { worker.fail(generation, "心率工作线程暂不可用"); return; } };
        if cancel.load(Ordering::SeqCst) { return; }
        #[cfg(target_os = "windows")]
        if windows_ble::connect(&worker, generation, &cancel, device.address).is_err() {
            worker.fail(generation, "心率连接失败：请确认广播仍开启、设备支持标准心率服务，或停止其他应用的蓝牙连接后重试");
        }
        #[cfg(not(target_os = "windows"))]
        worker.fail(generation, "当前仅支持 Windows 本地蓝牙连接");
    });
    runtime.status()
}

#[tauri::command]
pub fn heart_rate_disconnect(window: WebviewWindow, runtime: State<'_, HeartRateRuntime>) -> Result<HeartRateStatus, String> {
    require_main(window.label())?;
    let mut inner = runtime.inner.lock().map_err(|_| "心率状态暂不可用")?;
    inner.cancel.store(true, Ordering::SeqCst);
    inner.generation += 1;
    inner.status = HeartRateStatus::default();
    inner.received = None;
    inner.devices.clear();
    Ok(inner.status.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stable_ids_survive_new_scan_generations_without_exposing_addresses() {
        let runtime = HeartRateRuntime::default();
        let (first, _) = runtime.begin("scanning").unwrap();
        runtime.discover(first, 0x123456789abc, "Same name".into());
        let id = runtime.status().unwrap().devices[0].id.clone();
        runtime.update(first, |inner| inner.status.phase = "idle".into());
        let (second, _) = runtime.begin("scanning").unwrap();
        runtime.update(second, |inner| inner.devices.clear());
        runtime.discover(first, 0x987654321abc, "late event".into());
        assert!(runtime.status().unwrap().devices.is_empty());
        runtime.discover(second, 0x123456789abc, "renamed".into());
        assert_eq!(runtime.status().unwrap().devices[0].id, id);
        assert_ne!(device_id(0x987654321abc), id);
        assert!(!id.contains("123456789abc"));
        let json = serde_json::to_string(&runtime.status().unwrap()).unwrap();
        assert!(!json.contains("address"));
    }
    #[test]
    fn only_main_can_access_heart_rate() {
        assert!(require_main("main").is_ok());
        for label in ["companion", "companion-chat", "companion-feedback", ""] { assert!(require_main(label).is_err()); }
    }
    #[test]
    fn late_readings_cannot_revive_cancelled_session() {
        let runtime = HeartRateRuntime::default();
        let (old, cancel) = runtime.begin("connecting").unwrap();
        cancel.store(true, Ordering::SeqCst);
        runtime.receive(old, &[0, 72]);
        assert_eq!(runtime.status().unwrap().bpm, None);
    }
    #[test]
    fn stale_and_no_contact_readings_clear_previous_bpm() {
        let runtime = HeartRateRuntime::default();
        let (generation, _) = runtime.begin("connecting").unwrap();
        runtime.receive(generation, &[0, 72]);
        assert_eq!(runtime.status().unwrap().bpm, Some(72));
        runtime.inner.lock().unwrap().received = Some(Instant::now() - std::time::Duration::from_secs(11));
        assert_eq!(runtime.status().unwrap().bpm, None);
        runtime.receive(generation, &[4, 72]);
        assert_eq!(runtime.status().unwrap().bpm, None);
    }
}
