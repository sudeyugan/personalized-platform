mod windows;
use serde::Serialize;
use std::sync::{Mutex,Arc,atomic::{AtomicBool,Ordering}};
use tauri::{ipc::Channel,State,WebviewWindow};

#[derive(Clone,Debug,Default,PartialEq,Serialize)]
#[serde(rename_all="camelCase")]
pub struct WindowGeometry {
    pub available:bool,pub changed:bool,
    pub left:i32,pub top:i32,pub right:i32,pub bottom:i32,
    pub work_left:i32,pub work_top:i32,pub work_right:i32,pub work_bottom:i32,
}
#[derive(Default)]
struct Activation {lease:String,active:bool,subscription:String,channel:Option<Channel<bool>>}
#[derive(Default)]
pub struct PixelDesktopRuntime { stop:Mutex<Option<Arc<AtomicBool>>>,activation:Mutex<Activation> }
impl Drop for PixelDesktopRuntime {
    fn drop(&mut self) { if let Ok(stop)=self.stop.get_mut(){if let Some(stop)=stop.take(){stop.store(true,Ordering::SeqCst)}} }
}
fn allowed(label:&str)->bool { label=="main" }
fn id_ok(id:&str)->bool {id.len()==36&&id.bytes().all(|c|c.is_ascii_hexdigit()||c==b'-')}
#[tauri::command]
pub fn pixel_pet_activation(window:WebviewWindow,runtime:State<'_,PixelDesktopRuntime>,lease:String,active:bool)->Result<(),String>{
    if window.label()!="companion"||!id_ok(&lease){return Err("PIXEL_ACTIVATION_PERMISSION".into())}
    let mut state=runtime.activation.lock().map_err(|_|"PIXEL_ACTIVATION_BUSY")?;
    if active||state.lease==lease{
        state.lease=lease;state.active=active;
        if let Some(channel)=&state.channel{let _=channel.send(active);}
    }
    Ok(())
}
#[tauri::command]
pub fn pixel_pet_activation_subscribe(window:WebviewWindow,runtime:State<'_,PixelDesktopRuntime>,subscription:String,channel:Channel<bool>)->Result<(),String>{
    if !allowed(window.label())||!id_ok(&subscription){return Err("PIXEL_ACTIVATION_PERMISSION".into())}
    let mut state=runtime.activation.lock().map_err(|_|"PIXEL_ACTIVATION_BUSY")?;
    channel.send(state.active).map_err(|_|"PIXEL_ACTIVATION_CHANNEL")?;state.subscription=subscription;state.channel=Some(channel);Ok(())
}
#[tauri::command]
pub fn pixel_pet_activation_unsubscribe(window:WebviewWindow,runtime:State<'_,PixelDesktopRuntime>,subscription:String)->Result<(),String>{
    if !allowed(window.label()){return Err("PIXEL_ACTIVATION_PERMISSION".into())}
    let mut state=runtime.activation.lock().map_err(|_|"PIXEL_ACTIVATION_BUSY")?;
    if state.subscription==subscription{state.channel=None;state.subscription.clear();}Ok(())
}
#[tauri::command]
pub fn pixel_desktop_watch(window:WebviewWindow,runtime:State<'_,PixelDesktopRuntime>,enabled:bool,channel:Channel<WindowGeometry>) -> Result<(),String> {
    if !allowed(window.label()){return Err("PIXEL_DESKTOP_PERMISSION".into())}
    let mut current=runtime.stop.lock().map_err(|_|"PIXEL_DESKTOP_BUSY")?;
    if let Some(previous)=current.take(){previous.store(true,Ordering::SeqCst)}
    if !enabled{return Ok(())}
    let stop=Arc::new(AtomicBool::new(false));*current=Some(stop.clone());
    std::thread::spawn(move||windows::watch(stop,channel));
    Ok(())
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn only_main_can_enable_geometry_and_packet_has_no_titles_or_identity(){
        assert!(allowed("main"));for label in ["companion","companion-chat","companion-feedback","other",""]{assert!(!allowed(label))}
        let packet=serde_json::to_value(WindowGeometry::default()).unwrap();
        assert_eq!(packet.as_object().unwrap().len(),10);
        for field in ["title","text","pid","hwnd","process","image"]{assert!(packet.get(field).is_none())}
    }
    #[test] fn runtime_drop_revokes_existing_thread(){
        let stop=Arc::new(AtomicBool::new(false));
        {let runtime=PixelDesktopRuntime::default();*runtime.stop.lock().unwrap()=Some(stop.clone());}
        assert!(stop.load(Ordering::SeqCst));
    }
}
