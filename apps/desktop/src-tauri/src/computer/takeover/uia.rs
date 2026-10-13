use serde::Serialize;
use std::time::{Duration, Instant};
use windows::{core::Interface, Win32::{Foundation::HWND, System::{Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED}, Ole::{SafeArrayDestroy, SafeArrayGetElement, SafeArrayGetLBound, SafeArrayGetUBound}}, UI::Accessibility::{CUIAutomation8, IUIAutomation, IUIAutomation2, IUIAutomationElement, IUIAutomationInvokePattern, IUIAutomationValuePattern, UIA_InvokePatternId, UIA_ValuePatternId}}};

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Control {
    pub id: String,
    pub name: String,
    pub automation_id: String,
    pub control_type: i32,
    pub can_fill: bool,
    pub can_invoke: bool,
    #[serde(skip)] pub runtime_id: Vec<i32>,
}

struct ComApartment;
impl Drop for ComApartment { fn drop(&mut self) { unsafe { CoUninitialize() }; } }
// Fields drop in declaration order: release the COM client before its apartment.
pub struct Automation { pub client: IUIAutomation, _apartment: ComApartment }
impl Automation {
    pub fn new() -> Result<Self, String> {
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok().map_err(|_| "TAKEOVER_COM_UNAVAILABLE")?;
            let client: IUIAutomation = match CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER) {
                Ok(client) => client, Err(_) => { CoUninitialize(); return Err("TAKEOVER_UIA_UNAVAILABLE".into()); }
            };
            if let Ok(config) = client.cast::<IUIAutomation2>() { let _ = config.SetConnectionTimeout(1500); let _ = config.SetTransactionTimeout(1500); }
            Ok(Self { client, _apartment: ComApartment })
        }
    }
}

unsafe fn runtime_id(element: &IUIAutomationElement) -> Option<Vec<i32>> {
    let array = unsafe { element.GetRuntimeId() }.ok()?;
    if array.is_null() { return None; }
    let result = (|| unsafe {
        let low = SafeArrayGetLBound(array, 1).ok()?;
        let high = SafeArrayGetUBound(array, 1).ok()?;
        if high < low || high - low > 32 { return None; }
        let mut result = Vec::new();
        for index in low..=high {
            let mut value = 0i32;
            SafeArrayGetElement(array, &index, &mut value as *mut _ as *mut _).ok()?;
            result.push(value);
        }
        Some(result)
    })();
    let _ = unsafe { SafeArrayDestroy(array) };
    result
}

pub struct Snapshot { pub controls: Vec<(Control, IUIAutomationElement)>, pub truncated: bool }
pub fn walk(automation: &Automation, hwnd: HWND) -> Result<Snapshot, String> {
    unsafe {
        let root = automation.client.ElementFromHandle(hwnd).map_err(|_| "TAKEOVER_WINDOW_UNAVAILABLE")?;
        let walker = automation.client.ControlViewWalker().map_err(|_| "TAKEOVER_UIA_UNAVAILABLE")?;
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut result = Vec::new(); let mut pending = vec![(root, 0usize)]; let mut visited = 0; let mut truncated = false;
        while let Some((element, depth)) = pending.pop() {
            visited += 1;
            if visited > 160 || Instant::now() > deadline { truncated = true; break; }
            // Fail closed. Password nodes and their descendants never enter the snapshot.
            if element.CurrentIsPassword().map(|value| value.as_bool()).unwrap_or(true) { continue; }
            let visible = !element.CurrentIsOffscreen().map(|value| value.as_bool()).unwrap_or(true);
            if visible && element.CurrentIsEnabled().map(|value| value.as_bool()).unwrap_or(false) {
                if let Some(identity) = runtime_id(&element) {
                    let name = element.CurrentName().map(|value| value.to_string()).unwrap_or_default().chars().take(160).collect();
                    let control = Control { id: format!("e{}", result.len()), name, automation_id: element.CurrentAutomationId().map(|value| value.to_string()).unwrap_or_default().chars().take(100).collect(), control_type: element.CurrentControlType().map(|value| value.0).unwrap_or(0), can_fill: element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId).is_ok(), can_invoke: element.GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId).is_ok(), runtime_id: identity };
                    result.push((control, element.clone()));
                }
            }
            if depth < 12 {
                let mut children = Vec::new(); let mut next = walker.GetFirstChildElement(&element).ok();
                while let Some(child) = next {
                    if children.len() >= 80 || Instant::now() > deadline { truncated = true; break; }
                    next = walker.GetNextSiblingElement(&child).ok(); children.push((child, depth + 1));
                }
                pending.extend(children.into_iter().rev());
            } else if walker.GetFirstChildElement(&element).is_ok() { truncated = true; }
        }
        Ok(Snapshot { controls: result, truncated })
    }
}

pub fn act(element: &IUIAutomationElement, operation: &str, text: &str) -> Result<bool, String> {
    unsafe {
        if element.CurrentIsPassword().map(|value| value.as_bool()).unwrap_or(true)
            || !element.CurrentIsEnabled().map(|value| value.as_bool()).unwrap_or(false)
            || element.CurrentIsOffscreen().map(|value| value.as_bool()).unwrap_or(true) {
            return Err("TAKEOVER_CONTROL_UNAVAILABLE".into());
        }
        match operation {
            "fill" => {
                let value: IUIAutomationValuePattern = element.GetCurrentPatternAs(UIA_ValuePatternId).map_err(|_| "TAKEOVER_FILL_UNSUPPORTED")?;
                if value.CurrentIsReadOnly().map(|value| value.as_bool()).unwrap_or(true) { return Err("TAKEOVER_READ_ONLY_CONTROL".into()); }
                value.SetValue(&windows::core::BSTR::from(text)).map_err(|_| "TAKEOVER_FILL_FAILED")?;
                Ok(value.CurrentValue().map(|value| value.to_string() == text).unwrap_or(false))
            }
            "invoke" => {
                let invoke: IUIAutomationInvokePattern = element.GetCurrentPatternAs(UIA_InvokePatternId).map_err(|_| "TAKEOVER_INVOKE_UNSUPPORTED")?;
                invoke.Invoke().map_err(|_| "TAKEOVER_INVOKE_FAILED")?;
                // Invocation is only dispatch evidence; the next observation must check its result.
                Ok(false)
            }
            _ => Err("TAKEOVER_OPERATION_INVALID".into()),
        }
    }
}
