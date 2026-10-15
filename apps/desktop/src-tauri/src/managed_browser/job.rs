#[cfg(windows)]
pub struct ProcessJob(windows::Win32::Foundation::HANDLE);
#[cfg(windows)] unsafe impl Send for ProcessJob {}
#[cfg(windows)] impl ProcessJob {
    pub fn stop(&self){
        use windows::Win32::System::JobObjects::*;
        unsafe {
            let _=TerminateJobObject(self.0,1);
            let deadline=std::time::Instant::now()+std::time::Duration::from_secs(2);
            loop {
                let mut state=JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
                if QueryInformationJobObject(Some(self.0),JobObjectBasicAccountingInformation,&mut state as *mut _ as *mut _,std::mem::size_of_val(&state) as u32,None).is_err()||state.ActiveProcesses==0||std::time::Instant::now()>=deadline{break}
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
        }
    }
    pub fn attach(child:&std::process::Child)->Result<Self,String>{
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::{Foundation::{CloseHandle,HANDLE},System::JobObjects::*};
        unsafe {
            let handle=CreateJobObjectW(None,None).map_err(|_|"BROWSER_RUNTIME:")?;
            let mut limits=JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let configured=SetInformationJobObject(handle,JobObjectExtendedLimitInformation,&limits as *const _ as *const _,std::mem::size_of_val(&limits) as u32);
            if configured.is_err()||AssignProcessToJobObject(handle,HANDLE(child.as_raw_handle())).is_err(){let _=CloseHandle(handle);return Err("BROWSER_RUNTIME:".into())}
            Ok(Self(handle))
        }
    }
}
#[cfg(windows)] impl Drop for ProcessJob {fn drop(&mut self){unsafe{let _=windows::Win32::Foundation::CloseHandle(self.0);}}}
#[cfg(not(windows))]pub struct ProcessJob;
#[cfg(not(windows))]impl ProcessJob{pub fn attach(_:&std::process::Child)->Result<Self,String>{Err("BROWSER_MANAGED_INSTALL:".into())}pub fn stop(&self){}}
