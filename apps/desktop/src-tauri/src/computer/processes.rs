use serde_json::{json, Value};
use std::{
    io::Read,
    process::{Command, Stdio},
    sync::atomic::Ordering,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use super::types::{ComputerRuntime, ManagedChild, ManagedStatus};

const CREATE_NO_WINDOW: u32 = 0x08000000;
const MAX_OUTPUT: usize = 64 * 1024;

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
}

fn prepare(program: &str, args: &[String], cwd: Option<&str>) -> Command {
    let mut command = Command::new(program);
    command.args(args);
    if let Some(path) = cwd.filter(|value| !value.trim().is_empty()) {
        command.current_dir(path);
    }
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

fn shorten(bytes: &[u8]) -> String {
    String::from_utf8_lossy(&bytes[..bytes.len().min(MAX_OUTPUT)]).into_owned()
}
fn drain_output(reader: &mut impl Read) -> Vec<u8> {
    let mut saved = Vec::new();
    let mut chunk = [0u8; 8192];
    while let Ok(count) = reader.read(&mut chunk) {
        if count == 0 {
            break;
        }
        let remaining = (MAX_OUTPUT + 1).saturating_sub(saved.len());
        if remaining > 0 {
            saved.extend_from_slice(&chunk[..count.min(remaining)]);
        }
    }
    saved
}

pub fn run(runtime: &ComputerRuntime, program: &str, args: &[String], cwd: Option<&str>, timeout_ms: u64, detached: bool) -> Result<Value, String> {
    runtime.cancelled.store(false, Ordering::SeqCst);
    if program.trim().is_empty() {
        return Err("PROCESS_INVALID:程序不能为空".into());
    }
    if detached {
        let child = prepare(program, args, cwd).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
            .spawn().map_err(|error| format!("PROCESS_START:{error}"))?;
        let id = format!("process-{}-{}", now_ms(), child.id());
        let status = ManagedStatus { id: id.clone(), kind: "process".into(), label: program.into(), output_path: None, started_at_ms: now_ms() };
        runtime.processes.lock().map_err(|_| "PROCESS_STATE_LOCK".to_string())?.insert(id.clone(), ManagedChild { child, status });
        return Ok(json!({ "processId": id, "detached": true }));
    }

    let mut child = prepare(program, args, cwd).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|error| format!("PROCESS_START:{error}"))?;
    let mut stdout = child.stdout.take().ok_or_else(|| "PROCESS_STDOUT_MISSING".to_string())?;
    let mut stderr = child.stderr.take().ok_or_else(|| "PROCESS_STDERR_MISSING".to_string())?;
    let stdout_reader = thread::spawn(move || drain_output(&mut stdout));
    let stderr_reader = thread::spawn(move || drain_output(&mut stderr));
    let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms.clamp(1_000, 600_000));

    loop {
        if runtime.cancelled.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err("PROCESS_CANCELLED:已由紧急停止中止".into());
        }
        if let Some(status) = child.try_wait().map_err(|error| format!("PROCESS_WAIT:{error}"))? {
            let stdout = stdout_reader.join().unwrap_or_default();
            let stderr = stderr_reader.join().unwrap_or_default();
            return Ok(json!({
                "success": status.success(),
                "exitCode": status.code(),
                "stdout": shorten(&stdout),
                "stderr": shorten(&stderr),
                "truncated": stdout.len() > MAX_OUTPUT || stderr.len() > MAX_OUTPUT
            }));
        }
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err("PROCESS_TIMEOUT:程序执行超时".into());
        }
        thread::sleep(Duration::from_millis(50));
    }
}

pub fn shell(runtime: &ComputerRuntime, command: &str, cwd: Option<&str>, timeout_ms: u64) -> Result<Value, String> {
    run(runtime, "powershell.exe", &["-NoProfile".into(), "-NonInteractive".into(), "-Command".into(), command.into()], cwd, timeout_ms, false)
}

pub fn stop(runtime: &ComputerRuntime, id: &str) -> Result<(), String> {
    let mut processes = runtime.processes.lock().map_err(|_| "PROCESS_STATE_LOCK".to_string())?;
    let mut managed = processes.remove(id).ok_or_else(|| format!("PROCESS_NOT_MANAGED:{id}"))?;
    managed.child.kill().map_err(|error| format!("PROCESS_STOP:{error}"))?;
    let _ = managed.child.wait();
    Ok(())
}

pub fn prune(runtime: &ComputerRuntime) {
    if let Ok(mut processes) = runtime.processes.lock() {
        processes.retain(|_, managed| managed.child.try_wait().ok().flatten().is_none());
    }
}