// Read only while the user is dragging the companion; no hook, history or injection.
#[tauri::command]
pub fn companion_primary_button_down(window: tauri::WebviewWindow) -> Result<bool, String> {
    if !allowed_window(window.label()) {
        return Err("仅伙伴窗口可查询拖动状态".into());
    }
    primary_button_down()
}
fn allowed_window(label: &str) -> bool { label == "companion" }

#[cfg(target_os = "windows")]
fn primary_button_down() -> Result<bool, String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    Ok(unsafe { GetAsyncKeyState(i32::from(VK_LBUTTON.0)) } < 0)
}
#[cfg(not(target_os = "windows"))]
fn primary_button_down() -> Result<bool, String> {
    Err("当前平台需通过 pointerup 结束拖动".into())
}

#[cfg(test)]
mod tests {
    use super::allowed_window;
    #[test]
    fn rejects_main_chat_and_arbitrary_child_windows() {
        assert!(allowed_window("companion"));
        for label in ["main", "companion-chat", "", "companion-other"] {
            assert!(!allowed_window(label));
        }
    }
}
