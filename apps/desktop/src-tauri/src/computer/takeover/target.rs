use windows::{core::PWSTR, Win32::{Foundation::{CloseHandle, HWND, HANDLE, FILETIME}, Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY}, System::Threading::{GetProcessTimes, OpenProcess, OpenProcessToken, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION}}};
use super::super::windows::{window_handles, WindowInfo};

pub fn resolve(id: &str) -> Result<(HWND, WindowInfo, u64), String> {
    let (hwnd, info) = window_handles()?.into_iter().find(|(_, info)| info.window_id == id).ok_or("TAKEOVER_TARGET_LOST:目标窗口已关闭或更换")?;
    if info.process_id == std::process::id() { return Err("TAKEOVER_SELF_DENIED:不能接管一隅自身或授权窗口".into()); }
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, info.process_id).map_err(|_| "TAKEOVER_PROCESS_DENIED")?;
        let result: Result<u64, String> = (|| {
            let mut buffer = vec![0u16; 32768]; let mut length = buffer.len() as u32;
            QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buffer.as_mut_ptr()), &mut length).map_err(|_| "TAKEOVER_PROCESS_DENIED")?;
            let path = String::from_utf16_lossy(&buffer[..length as usize]).to_lowercase();
            let program = path.rsplit('\\').next().unwrap_or_default();
            if ["cmd.exe", "powershell.exe", "pwsh.exe", "windowsterminal.exe", "conhost.exe", "regedit.exe", "taskmgr.exe", "consent.exe", "mintty.exe", "putty.exe", "wezterm-gui.exe", "alacritty.exe", "code.exe", "cursor.exe"].contains(&program) { return Err("TAKEOVER_SENSITIVE_APP_DENIED".into()); }
            let mut token = HANDLE::default();
            OpenProcessToken(process, TOKEN_QUERY, &mut token).map_err(|_| "TAKEOVER_PROCESS_DENIED")?;
            let mut elevation = TOKEN_ELEVATION::default(); let mut size = 0;
            let checked = GetTokenInformation(token, TokenElevation, Some(&mut elevation as *mut _ as *mut _), std::mem::size_of::<TOKEN_ELEVATION>() as u32, &mut size);
            let _ = CloseHandle(token);
            checked.map_err(|_| "TAKEOVER_PROCESS_DENIED")?;
            if elevation.TokenIsElevated != 0 { return Err("TAKEOVER_ELEVATED_APP_DENIED:管理员窗口需由你操作".into()); }
            let mut creation = FILETIME::default(); let mut exit = FILETIME::default(); let mut kernel = FILETIME::default(); let mut user = FILETIME::default();
            GetProcessTimes(process, &mut creation, &mut exit, &mut kernel, &mut user).map_err(|_| "TAKEOVER_PROCESS_DENIED")?;
            Ok(((creation.dwHighDateTime as u64) << 32) | creation.dwLowDateTime as u64)
        })();
        let _ = CloseHandle(process);
        return Ok((hwnd, info, result?));
    }
}
