//! Explicit opt-in integration probe; never discovers or interacts with user windows.
use super::uia;
use std::{sync::mpsc, thread, time::Duration};
use windows::{core::w, Win32::{Foundation::{HWND, LPARAM, WPARAM}, System::Threading::GetCurrentThreadId, UI::WindowsAndMessaging::*}};

struct Fixture { thread_id: u32, thread: Option<thread::JoinHandle<()>>, hwnd: HWND }
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = unsafe { PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0)) };
        if let Some(thread) = self.thread.take() { let _ = thread.join(); }
    }
}
fn fixture() -> Fixture {
    let (sender, receiver) = mpsc::sync_channel(1);
    let thread = thread::spawn(move || unsafe {
        let parent = CreateWindowExW(WS_EX_NOACTIVATE, w!("STATIC"), w!("一隅 UIA 隔离测试（虚构内容）"), WS_OVERLAPPEDWINDOW | WS_VISIBLE, 50, 50, 420, 220, None, None, None, None).unwrap();
        CreateWindowExW(WINDOW_EX_STYLE(0), w!("EDIT"), w!(""), WS_CHILD | WS_VISIBLE | WS_BORDER | WINDOW_STYLE(ES_AUTOHSCROLL as u32), 20, 20, 250, 30, Some(parent), None, None, None).unwrap();
        CreateWindowExW(WINDOW_EX_STYLE(0), w!("EDIT"), w!("do-not-export-secret"), WS_CHILD | WS_VISIBLE | WS_BORDER | WINDOW_STYLE(ES_PASSWORD as u32), 20, 60, 250, 30, Some(parent), None, None, None).unwrap();
        CreateWindowExW(WINDOW_EX_STYLE(0), w!("BUTTON"), w!("Search"), WS_CHILD | WS_VISIBLE, 20, 100, 100, 30, Some(parent), None, None, None).unwrap();
        sender.send((parent.0 as usize, GetCurrentThreadId())).unwrap();
        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).0 > 0 { let _ = TranslateMessage(&message); DispatchMessageW(&message); }
        let _ = DestroyWindow(parent);
    });
    let (handle, thread_id) = receiver.recv_timeout(Duration::from_secs(5)).unwrap();
    Fixture { thread_id, thread: Some(thread), hwnd: HWND(handle as *mut _) }
}

#[test]
#[ignore = "显式隔离原生探针，仅创建虚构窗口，不枚举用户桌面"]
fn isolated_native_uia_observe_fill_invoke_and_password_redaction() {
    let fixture = fixture(); let automation = uia::Automation::new().unwrap();
    let snapshot = uia::walk(&automation, fixture.hwnd).unwrap();
    assert!(!snapshot.truncated);
    let edits: Vec<_> = snapshot.controls.iter().filter(|(control, _)| control.control_type == 50004).collect();
    assert_eq!(edits.len(), 1, "password edit must be excluded");
    assert!(edits[0].0.can_fill);
    assert!(uia::act(&edits[0].1, "fill", "Synthetic search term").unwrap());
    let button = snapshot.controls.iter().find(|(control, _)| control.name == "Search" && control.can_invoke).unwrap();
    assert!(!uia::act(&button.1, "invoke", "").unwrap(), "dispatch is not completion evidence");
    let after = uia::walk(&automation, fixture.hwnd).unwrap();
    let safe = serde_json::to_string(&after.controls.iter().map(|(control, _)| control).collect::<Vec<_>>()).unwrap();
    assert!(!safe.contains("do-not-export-secret"));
    assert!(after.controls.iter().any(|(control, _)| control.runtime_id == edits[0].0.runtime_id));
}
