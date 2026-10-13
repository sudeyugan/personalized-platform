const explanations: Record<string, string> = {
  TAKEOVER_SELF_DENIED: '不能接管一隅自身或授权界面，请选择另一个窗口。',
  TAKEOVER_SENSITIVE_APP_DENIED: '首阶段不接管终端、系统管理工具或可能含终端的开发工具。',
  TAKEOVER_ELEVATED_APP_DENIED: '这个窗口以管理员权限运行，需要由你手动操作。',
  TAKEOVER_PROCESS_DENIED: '无法安全核实目标程序，本次没有继续接管。',
  TAKEOVER_TARGET_LOST: '选定窗口已关闭或更换，请重新选择并确认。',
  TAKEOVER_STALE_OBSERVATION: '界面观察已经失效，没有重放这次操作。请重新开始并观察。',
  TAKEOVER_ELEMENT_CHANGED: '目标控件已经变化，没有继续操作。请重新开始并观察。',
  TAKEOVER_FILL_UNSUPPORTED: '这个控件不支持安全的普通填写，已交还你处理。',
  TAKEOVER_UIA_UNAVAILABLE: '这个窗口无法通过当前控件识别接口读取，不等于缺少整个程序的权限。',
  TAKEOVER_CONSEQUENTIAL_ACTION_DENIED: '这个控件可能涉及提交、发送、保存、删除或敏感操作，请你手动处理。',
}
export function describeTakeoverError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error)
  return Object.entries(explanations).find(([code]) => raw.includes(code))?.[1] ?? raw
}
