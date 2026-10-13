use super::WindowGeometry;
use std::sync::{Arc,atomic::{AtomicBool,Ordering}};
use tauri::ipc::Channel;
use std::cell::Cell;
use windows::Win32::{
    Foundation::{HWND,RECT},
    Graphics::{Dwm::{DwmGetWindowAttribute,DWMWA_CLOAKED,DWMWA_EXTENDED_FRAME_BOUNDS},Gdi::{MonitorFromWindow,GetMonitorInfoW,MONITOR_DEFAULTTONEAREST,MONITORINFO}},
    System::Threading::GetCurrentProcessId,
    UI::{Accessibility::{SetWinEventHook,UnhookWinEvent,HWINEVENTHOOK},WindowsAndMessaging::*},
};
thread_local! {static DIRTY:Cell<bool>=const {Cell::new(true)};}
unsafe extern "system" fn changed(_:HWINEVENTHOOK,event:u32,hwnd:HWND,object:i32,_:i32,_:u32,_:u32) {
    if event==EVENT_OBJECT_LOCATIONCHANGE&&(object!=OBJID_WINDOW.0||hwnd!=unsafe{GetForegroundWindow()}){return}
    DIRTY.with(|dirty|dirty.set(true));
}
fn geometry() -> (HWND,WindowGeometry) {
    let hwnd=unsafe{GetForegroundWindow()};let mut packet=WindowGeometry::default();
    if hwnd.0.is_null(){return (hwnd,packet)}
    let mut process=0;unsafe{GetWindowThreadProcessId(hwnd,Some(&mut process))};
    if process==unsafe{GetCurrentProcessId()}||unsafe{IsIconic(hwnd)}.as_bool()||!unsafe{IsWindowVisible(hwnd)}.as_bool(){return (hwnd,packet)}
    let mut cloak=0u32;let mut rect=RECT::default();
    if unsafe{DwmGetWindowAttribute(hwnd,DWMWA_CLOAKED,(&mut cloak as *mut u32).cast(),4)}.is_err()||cloak!=0{return (hwnd,packet)}
    if unsafe{DwmGetWindowAttribute(hwnd,DWMWA_EXTENDED_FRAME_BOUNDS,(&mut rect as *mut RECT).cast(),std::mem::size_of::<RECT>() as u32)}.is_err(){return (hwnd,packet)}
    let monitor=unsafe{MonitorFromWindow(hwnd,MONITOR_DEFAULTTONEAREST)};
    let mut info=MONITORINFO{cbSize:std::mem::size_of::<MONITORINFO>() as u32,..Default::default()};
    if !unsafe{GetMonitorInfoW(monitor,&mut info)}.as_bool(){return (hwnd,packet)}
    let full=info.rcMonitor;
    // Borderless fullscreen uses monitor bounds; maximized work-area windows
    // are not silently treated as fullscreen. No title/class/content queries.
    if rect.left<=full.left+2&&rect.top<=full.top+2&&rect.right>=full.right-2&&rect.bottom>=full.bottom-2{return (hwnd,packet)}
    if rect.right<=rect.left||rect.bottom<=rect.top{return (hwnd,packet)}
    let work=info.rcWork;
    packet=WindowGeometry{available:true,left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,
        work_left:work.left,work_top:work.top,work_right:work.right,work_bottom:work.bottom,changed:false};
    (hwnd,packet)
}
pub fn watch(stop:Arc<AtomicBool>,channel:Channel<WindowGeometry>) {
    if stop.load(Ordering::SeqCst){return}
    let events=[EVENT_SYSTEM_FOREGROUND,EVENT_OBJECT_LOCATIONCHANGE,EVENT_OBJECT_DESTROY,EVENT_SYSTEM_MINIMIZESTART,EVENT_SYSTEM_MINIMIZEEND];
    let hooks:Vec<_>=events.into_iter().map(|event|unsafe{SetWinEventHook(event,event,None,Some(changed),0,0,WINEVENT_OUTOFCONTEXT|WINEVENT_SKIPOWNPROCESS)}).collect();
    let timer=unsafe{SetTimer(None,0,100,None)};
    if timer==0||hooks.iter().any(|hook|hook.0.is_null()){
        for hook in hooks{if !hook.0.is_null(){unsafe{UnhookWinEvent(hook)};}}
        if timer!=0{let _=unsafe{KillTimer(None,timer)};}
        if !stop.load(Ordering::SeqCst){let _=channel.send(WindowGeometry::default());}
        return
    }
    let mut previous:Option<WindowGeometry>=None;let mut last=HWND::default();
    let mut msg=MSG::default();
    while !stop.load(Ordering::SeqCst){
        let result=unsafe{GetMessageW(&mut msg,None,0,0)};
        if result.0<=0{break}
        if stop.load(Ordering::SeqCst){break}
        if DIRTY.with(|dirty|dirty.replace(false)){
            let (hwnd,mut packet)=geometry();packet.changed=hwnd!=last;last=hwnd;
            if previous.as_ref()!=Some(&packet){
                previous=Some(packet.clone());
                if stop.load(Ordering::SeqCst)||channel.send(packet).is_err(){break}
            }
        }
        unsafe{TranslateMessage(&msg);DispatchMessageW(&msg);}
    }
    let _=unsafe{KillTimer(None,timer)};for hook in hooks{unsafe{UnhookWinEvent(hook)};}
}
