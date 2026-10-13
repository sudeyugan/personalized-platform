pub fn forbidden(label: &str) -> bool {
    let text = label.to_lowercase();
    ["发送", "提交", "付款", "支付", "购买", "下单", "删除", "覆盖", "登录", "密码", "授权", "安装", "卸载", "运行", "执行", "终端", "命令", "格式化", "重置", "退出", "关闭", "保存", "上传", "发布", "转账", "send", "submit", "pay", "purchase", "buy", "delete", "remove", "overwrite", "login", "sign in", "password", "install", "run", "execute", "terminal", "command", "format", "reset", "quit", "close", "save", "upload", "publish", "transfer"]
        .iter().any(|word| text.contains(word))
}

pub fn auto_invoke(label: &str) -> bool {
    matches!(label.trim().to_lowercase().as_str(), "搜索" | "查找" | "下一项" | "上一项" | "展开" | "收起" | "返回" | "search" | "find" | "find next" | "find previous" | "expand" | "collapse" | "back")
}

pub fn auto_fill(name: &str, automation_id: &str) -> bool {
    let label = format!("{name} {automation_id}").to_lowercase();
    ["搜索", "查找", "search", "find"].iter().any(|word| label.contains(word))
}

pub fn validate_text(text: &str) -> Result<(), String> {
    if text.chars().count() > 2000 || text.chars().any(|c| c.is_control()) {
        return Err("TAKEOVER_TEXT_INVALID:仅支持2000字以内的单行普通文字".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn consequential_labels_never_auto_execute() {
        for label in ["提交作业", "Send message", "Save as", "删除文件", "支付", "Login", "格式化", "上传", "运行命令"] { assert!(forbidden(label)); assert!(!auto_invoke(label)); }
        assert!(!forbidden("查找")); assert!(auto_invoke("Search")); assert!(!auto_invoke("确定"));
    }
    #[test] fn fill_cannot_type_enter_or_unbounded_content() {
        assert!(validate_text("课题名称").is_ok()); assert!(validate_text("a\nb").is_err()); assert!(validate_text(&"字".repeat(2001)).is_err());
    }
}
