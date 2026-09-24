use super::types::{ComputerActionRequest, ComputerGrant, ComputerPolicy};

pub fn capability(action: &str) -> Option<&'static str> {
    Some(match action {
        "app_list" | "app_open" => "applications",
        "window_list" | "window_focus" | "window_close" | "window_move" => "windows",
        "screen_list_sources" | "screen_capture" => "screen_capture",
        "screen_record_start" | "screen_record_stop" | "screen_record_status" => "screen_record",
        "input_click" | "input_type_text" | "input_hotkey" => "input",
        "clipboard_read" => "clipboard_read",
        "clipboard_write" => "clipboard_write",
        "file_list" | "file_search" | "file_read_text" => "file_read",
        "file_write_text" | "file_copy" | "file_move" => "file_write",
        "file_delete" => "file_delete",
        "process_list" | "process_run" => "process_run",
        "process_stop" => "process_stop",
        "shell_run" => "shell",
        "notify" => "notifications",
        _ => return None,
    })
}

fn request_target(request: &ComputerActionRequest) -> String {
    let key = match request.action.as_str() {
        "app_open" => "target",
        "window_focus" | "window_close" | "window_move" => "title",
        "file_list" | "file_search" | "file_read_text" | "file_write_text" | "file_delete" => "path",
        "file_copy" | "file_move" => "destination",
        "process_run" => "program",
        "screen_capture" | "screen_record_start" => "source",
        _ => return String::new(),
    };
    request.params.get(key).and_then(|value| value.as_str()).unwrap_or_default().trim().replace('/', "\\").to_lowercase()
}

pub fn grant_matches(grant: &ComputerGrant, required: &str, actual: &str) -> bool {
    if grant.capability != required {
        return false;
    }
    let expected = grant.target.trim().replace('/', "\\").to_lowercase();
    if grant.target_kind == "global" || expected == "*" {
        return true;
    }
    if actual.is_empty() {
        return false;
    }
    if grant.target_kind == "directory" {
        return actual == expected || actual.starts_with(&format!("{}\\", expected.trim_end_matches('\\')));
    }
    actual == expected || actual.ends_with(&format!("\\{expected}"))
}

pub fn target_allowed(policy: &ComputerPolicy, capability: &str, target: &str) -> bool {
    let normalized = target.trim().replace('/', "\\").to_lowercase();
    policy.grants.iter().rev().find(|grant| grant_matches(grant, capability, &normalized)).is_some_and(|grant| grant.mode == "allow")
}

pub fn authorize(policy: &ComputerPolicy, request: &ComputerActionRequest, confirmed: bool) -> Result<(), String> {
    if !policy.enabled {
        return Err("COMPUTER_PERMISSION_DISABLED:请先在 AI 伙伴设置中开启电脑能力".into());
    }
    let required = capability(&request.action).ok_or_else(|| format!("COMPUTER_ACTION_UNKNOWN:{}", request.action))?;
    let actual = request_target(request);
    let matching = policy.grants.iter().rev().find(|grant| grant_matches(grant, required, &actual));
    if matching.is_some_and(|grant| grant.mode == "deny") {
        return Err("COMPUTER_PERMISSION_DENIED:目标已被明确禁止".into());
    }

    let protected = matches!(required, "file_delete" | "process_stop" | "shell")
        || matches!(request.action.as_str(), "window_close" | "file_move");
    if protected {
        return if confirmed { Ok(()) } else { Err("COMPUTER_CONFIRMATION_REQUIRED:高影响操作需要本次确认".into()) };
    }
    if matching.is_some_and(|grant| grant.mode == "allow") {
        return Ok(());
    }
    if matching.is_some_and(|grant| grant.mode == "ask") {
        return if confirmed { Ok(()) } else { Err("COMPUTER_CONFIRMATION_REQUIRED:此目标设置为执行前询问".into()) };
    }

    let trusted_automatic = matches!(
        required,
        "applications" | "windows" | "screen_capture" | "screen_record" | "input"
            | "clipboard_read" | "clipboard_write" | "notifications"
    );
    if policy.profile == "trusted_workstation" && trusted_automatic {
        return Ok(());
    }
    if policy.profile == "standard"
        && matches!(
            request.action.as_str(),
            "app_list" | "window_list" | "screen_list_sources" | "screen_record_status" | "process_list"
        )
    {
        return Ok(());
    }
    if confirmed {
        Ok(())
    } else {
        Err("COMPUTER_CONFIRMATION_REQUIRED:需要本次确认或为目标添加长期授权".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn policy() -> ComputerPolicy {
        ComputerPolicy {
            enabled: true,
            profile: "custom".into(),
            ffmpeg_path: String::new(),
            recording_directory: String::new(),
            grants: vec![ComputerGrant {
                capability: "file_read".into(),
                target_kind: "directory".into(),
                target: r"D:\coding".into(),
                mode: "allow".into(),
            }],
        }
    }

    #[test]
    fn directory_grant_is_scoped() {
        assert!(target_allowed(&policy(), "file_read", r"D:\coding\yiyu\README.md"));
        assert!(!target_allowed(&policy(), "file_read", r"D:\other\README.md"));
    }

    #[test]
    fn destructive_action_always_needs_confirmation() {
        let request = ComputerActionRequest {
            action: "file_delete".into(),
            params: HashMap::from([("path".into(), serde_json::json!(r"D:\coding\x.txt"))]),
        };
        assert!(authorize(&policy(), &request, false).is_err());
        assert!(authorize(&policy(), &request, true).is_ok());
    }
}
