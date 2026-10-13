use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    process::Child,
    sync::{atomic::{AtomicBool, AtomicU64}, Mutex},
};

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComputerGrant {
    pub capability: String,
    pub target_kind: String,
    pub target: String,
    pub mode: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ComputerPolicy {
    pub enabled: bool,
    pub profile: String,
    pub ffmpeg_path: String,
    pub recording_directory: String,
    #[serde(default)]
    pub grants: Vec<ComputerGrant>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ComputerActionRequest {
    pub action: String,
    #[serde(default)]
    pub params: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedStatus {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub output_path: Option<String>,
    pub started_at_ms: u128,
}

pub struct ManagedChild {
    pub child: Child,
    pub status: ManagedStatus,
}

pub struct ComputerRuntime {
    pub desktop_operation: Mutex<()>,
    pub takeover: Mutex<Option<super::takeover::Session>>,
    pub takeover_generation: AtomicU64,
    pub recordings: Mutex<HashMap<String, ManagedChild>>,
    pub processes: Mutex<HashMap<String, ManagedChild>>,
    pub cancelled: AtomicBool,
}

impl Default for ComputerRuntime {
    fn default() -> Self {
        Self {
            desktop_operation: Mutex::new(()),
            takeover: Mutex::new(None),
            takeover_generation: AtomicU64::new(0),
            recordings: Mutex::new(HashMap::new()),
            processes: Mutex::new(HashMap::new()),
            cancelled: AtomicBool::new(false),
        }
    }
}

impl ComputerRuntime {
    pub fn is_active(&self) -> bool {
        self.takeover.lock().map(|slot| slot.as_ref().is_some_and(|session| session.expires > std::time::Instant::now())).unwrap_or(false)
            || !self.recordings.lock().map(|items| items.is_empty()).unwrap_or(true)
            || !self.processes.lock().map(|items| items.is_empty()).unwrap_or(true)
    }

    pub fn stop_all(&self) -> usize {
        self.takeover_generation.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        self.cancelled.store(true, std::sync::atomic::Ordering::SeqCst);
        let mut stopped = 0;
        if let Ok(mut slot) = self.takeover.lock() { if slot.take().is_some() { stopped += 1; } }
        if let Ok(mut recordings) = self.recordings.lock() {
            for (_, mut managed) in recordings.drain() {
                if let Some(stdin) = managed.child.stdin.as_mut() {
                    use std::io::Write;
                    let _ = stdin.write_all(b"q\n");
                }
                let _ = managed.child.kill();
                let _ = managed.child.wait();
                stopped += 1;
            }
        }
        if let Ok(mut processes) = self.processes.lock() {
            for (_, mut managed) in processes.drain() {
                let _ = managed.child.kill();
                let _ = managed.child.wait();
                stopped += 1;
            }
        }
        stopped
    }

    pub fn statuses(&self) -> (Vec<ManagedStatus>, Vec<ManagedStatus>) {
        let recordings = self.recordings.lock().map(|items| items.values().map(|item| item.status.clone()).collect()).unwrap_or_default();
        let processes = self.processes.lock().map(|items| items.values().map(|item| item.status.clone()).collect()).unwrap_or_default();
        (recordings, processes)
    }
}
