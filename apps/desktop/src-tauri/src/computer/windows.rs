use serde::Serialize;
use windows::{
    core::{BOOL, PCWSTR},
    Win32::{
        Foundation::{HWND, LPARAM, RECT, WPARAM},
        UI::{
            Input::KeyboardAndMouse::{
                keybd_event, mouse_event, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
                KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, MOUSEEVENTF_LEFTDOWN,
                MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP,
                MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, VIRTUAL_KEY, VK_CONTROL, VK_LWIN,
                VK_MENU, VK_SHIFT,
            },
            Shell::ShellExecuteW,
            WindowsAndMessaging::{
                EnumWindows, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
                GetWindowThreadProcessId, IsWindowVisible, PostMessageW, SetCursorPos,
                SetForegroundWindow, SetWindowPos, SWP_NOZORDER, SWP_SHOWWINDOW, SW_SHOWNORMAL,
                WM_CLOSE,
            },
        },
    },
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    pub title: String,
    pub process_id: u32,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

unsafe extern "system" fn collect_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
        return BOOL(1);
    }
    let length = unsafe { GetWindowTextLengthW(hwnd) };
    if length <= 0 {
        return BOOL(1);
    }
    let mut buffer = vec![0u16; length as usize + 1];
    let written = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    if written <= 0 {
        return BOOL(1);
    }
    let title = String::from_utf16_lossy(&buffer[..written as usize]);
    if title.trim().is_empty() {
        return BOOL(1);
    }
    let mut process_id = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut process_id)); }
    let mut rect = RECT::default();
    let _ = unsafe { GetWindowRect(hwnd, &mut rect) };
    let windows = unsafe { &mut *(lparam.0 as *mut Vec<(HWND, WindowInfo)>) };
    windows.push((
        hwnd,
        WindowInfo {
            title,
            process_id,
            x: rect.left,
            y: rect.top,
            width: rect.right - rect.left,
            height: rect.bottom - rect.top,
        },
    ));
    BOOL(1)
}

fn window_handles() -> Result<Vec<(HWND, WindowInfo)>, String> {
    let mut windows = Vec::new();
    unsafe { EnumWindows(Some(collect_window), LPARAM(&mut windows as *mut _ as isize)) }
        .map_err(|error| format!("WINDOW_ENUM:{error}"))?;
    Ok(windows)
}

fn find_window(title: &str) -> Result<HWND, String> {
    let needle = title.trim().to_lowercase();
    window_handles()?
        .into_iter()
        .find(|(_, item)| item.title.to_lowercase().contains(&needle))
        .map(|(hwnd, _)| hwnd)
        .ok_or_else(|| format!("WINDOW_NOT_FOUND:{title}"))
}

pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    Ok(window_handles()?.into_iter().map(|(_, info)| info).collect())
}

pub fn focus_window(title: &str) -> Result<(), String> {
    if unsafe { SetForegroundWindow(find_window(title)?) }.as_bool() {
        Ok(())
    } else {
        Err("WINDOW_FOCUS_FAILED:Windows 拒绝切换到目标窗口".into())
    }
}

pub fn close_window(title: &str) -> Result<(), String> {
    unsafe { PostMessageW(Some(find_window(title)?), WM_CLOSE, WPARAM(0), LPARAM(0)) }
        .map_err(|error| format!("WINDOW_CLOSE:{error}"))
}

pub fn move_window(title: &str, x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
    unsafe {
        SetWindowPos(
            find_window(title)?,
            None,
            x,
            y,
            width,
            height,
            SWP_NOZORDER | SWP_SHOWWINDOW,
        )
    }
    .map_err(|error| format!("WINDOW_MOVE:{error}"))
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn looks_like_web_domain(value: &str) -> bool {
    if value.chars().any(char::is_whitespace) || value.contains('\\') {
        return false;
    }
    let host = value.split(['/', '?', '#']).next().unwrap_or_default();
    let host = host.strip_prefix("www.").unwrap_or(host);
    let labels = host.split('.').collect::<Vec<_>>();
    if labels.len() < 2
        || labels.iter().any(|label| {
            label.is_empty()
                || label.starts_with('-')
                || label.ends_with('-')
                || !label.chars().all(|character| character.is_ascii_alphanumeric() || character == '-')
        })
    {
        return false;
    }
    matches!(
        labels.last().copied().unwrap_or_default().to_ascii_lowercase().as_str(),
        "com" | "cn" | "net" | "org" | "io" | "ai" | "dev" | "app" | "tv" | "me" | "co"
    )
}

fn normalize_open_target(target: &str) -> String {
    let trimmed = target.trim();
    if looks_like_web_domain(trimmed) {
        format!("https://{trimmed}")
    } else {
        trimmed.to_string()
    }
}

pub fn open_target(target: &str) -> Result<String, String> {
    if target.trim().is_empty() {
        return Err("APP_OPEN_INVALID:目标不能为空".into());
    }
    let target = normalize_open_target(target);
    let lower = target.to_lowercase();
    if lower.contains("://") && !lower.starts_with("https://") {
        return Err("APP_OPEN_PROTOCOL_DENIED:只允许打开 HTTPS 链接".into());
    }
    if [".cmd", ".bat", ".ps1", ".vbs", ".js", ".reg", ".msi", ".lnk"]
        .iter()
        .any(|extension| lower.ends_with(extension))
    {
        return Err("APP_OPEN_EXECUTABLE_SCRIPT_DENIED:脚本或安装操作必须使用受确认的进程工具".into());
    }
    let operation = wide("open");
    let file = wide(&target);
    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(operation.as_ptr()),
            PCWSTR(file.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if result.0 as isize <= 32 {
        Err(format!("APP_OPEN_FAILED:ShellExecuteW={}", result.0 as isize))
    } else {
        Ok(target)
    }
}
pub fn click(x: i32, y: i32, button: &str) -> Result<(), String> {
    unsafe { SetCursorPos(x, y) }.map_err(|error| format!("INPUT_CURSOR:{error}"))?;
    let (down, up) = match button {
        "right" => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
        "middle" => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
        _ => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
    };
    unsafe {
        mouse_event(down, 0, 0, 0, 0);
        mouse_event(up, 0, 0, 0, 0);
    }
    Ok(())
}

pub fn type_text(text: &str) -> Result<(), String> {
    if text.encode_utf16().count() > 10_000 {
        return Err("INPUT_TOO_LONG:单次输入最多 10000 个 UTF-16 单元".into());
    }
    let mut inputs = Vec::new();
    for unit in text.encode_utf16() {
        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: KEYEVENTF_UNICODE,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
    }
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent == inputs.len() as u32 {
        Ok(())
    } else {
        Err(format!("INPUT_SEND_FAILED:{sent}/{}", inputs.len()))
    }
}

fn virtual_key(name: &str) -> Option<u8> {
    let upper = name.trim().to_uppercase();
    Some(match upper.as_str() {
        "CTRL" | "CONTROL" => VK_CONTROL.0 as u8,
        "ALT" => VK_MENU.0 as u8,
        "SHIFT" => VK_SHIFT.0 as u8,
        "WIN" | "META" => VK_LWIN.0 as u8,
        "ENTER" => 0x0D,
        "TAB" => 0x09,
        "ESC" | "ESCAPE" => 0x1B,
        "SPACE" => 0x20,
        "BACKSPACE" => 0x08,
        "DELETE" => 0x2E,
        value if value.len() == 1 && value.as_bytes()[0].is_ascii_alphanumeric() => value.as_bytes()[0],
        value if value.starts_with('F') => {
            let number = value[1..].parse::<u8>().ok()?;
            if !(1..=12).contains(&number) {
                return None;
            }
            0x6F + number
        }
        _ => return None,
    })
}

pub fn hotkey(keys: &[String]) -> Result<(), String> {
    if keys.is_empty() || keys.len() > 6 {
        return Err("INPUT_HOTKEY_INVALID:快捷键需要 1 至 6 个按键".into());
    }
    let codes = keys
        .iter()
        .map(|key| virtual_key(key).ok_or_else(|| format!("INPUT_KEY_UNSUPPORTED:{key}")))
        .collect::<Result<Vec<_>, _>>()?;
    for code in &codes {
        unsafe { keybd_event(*code, 0, KEYBD_EVENT_FLAGS(0), 0); }
    }
    for code in codes.iter().rev() {
        unsafe { keybd_event(*code, 0, KEYEVENTF_KEYUP, 0); }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::{looks_like_web_domain, normalize_open_target};

    #[test]
    fn normalizes_plain_web_domains_to_https() {
        assert!(looks_like_web_domain("bilibili.com"));
        assert_eq!(normalize_open_target("bilibili.com"), "https://bilibili.com");
        assert_eq!(normalize_open_target("www.bilibili.com/video/BV1"), "https://www.bilibili.com/video/BV1");
        assert_eq!(normalize_open_target("https://bilibili.com"), "https://bilibili.com");
    }

    #[test]
    fn does_not_reinterpret_apps_or_files_as_websites() {
        assert!(!looks_like_web_domain("notepad.exe"));
        assert!(!looks_like_web_domain(r"D:\\coding\\README.md"));
        assert_eq!(normalize_open_target("notepad.exe"), "notepad.exe");
    }
}