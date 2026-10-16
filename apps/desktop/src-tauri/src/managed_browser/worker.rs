use std::{io::{BufRead,BufReader,Read,Write},path::Path,process::{Child,ChildStdin,Command,Stdio},sync::{atomic::{AtomicU64,Ordering},mpsc::{self,Receiver}},time::{Instant,Duration}};
use serde_json::{Value,json};
use super::job::ProcessJob;
pub struct Worker { child:Child,input:ChildStdin,output:Receiver<Result<Value,String>>,sequence:u64,_job:ProcessJob,pub login:bool,pub recording:bool }
impl Worker {
    pub fn start(directory:&Path,profile:&Path)->Result<Self,String>{
        let mut command=Command::new(directory.join("node.exe"));
        command.arg(directory.join("engine/main.mjs")).arg(profile).current_dir(directory).env_clear();
        for key in ["SystemRoot","WINDIR","TEMP","TMP","LOCALAPPDATA","APPDATA","USERPROFILE","PROGRAMFILES","PROGRAMFILES(X86)","COMSPEC"]{if let Some(value)=std::env::var_os(key){command.env(key,value);}}
        command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        #[cfg(windows)]{use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
        let mut child=command.spawn().map_err(|_|"BROWSER_MANAGED_INSTALL:")?;
        let job=match ProcessJob::attach(&child){Ok(job)=>job,Err(error)=>{let _=child.kill();let _=child.wait();return Err(error)}};
        let input=child.stdin.take().ok_or("BROWSER_RUNTIME:")?;let stdout=child.stdout.take().ok_or("BROWSER_RUNTIME:")?;
        let (tx,output)=mpsc::sync_channel(2);
        std::thread::spawn(move||{
            let mut reader=BufReader::new(stdout);
            loop {
                let mut bytes=Vec::new();
                let result=reader.by_ref().take(131073).read_until(b'\n',&mut bytes);
                if result.is_err()||bytes.is_empty(){break}
                let value=if bytes.len()>131072||!bytes.ends_with(b"\n"){Err("BROWSER_RESULT:".into())}else{serde_json::from_slice(&bytes).map_err(|_|"BROWSER_RESULT:".into())};
                if tx.send(value).is_err(){break}
            }
        });
        Ok(Self{child,input,output,sequence:0,_job:job,login:false,recording:false})
    }
    pub fn call(&mut self,mut command:Value,epoch:&AtomicU64,expected:u64)->Result<Value,String>{
        if epoch.load(Ordering::SeqCst)!=expected{return Err("BROWSER_CANCELLED:".into())}
        self.sequence+=1;command["id"]=json!(self.sequence);
        let mut bytes=serde_json::to_vec(&command).map_err(|_|"BROWSER_ARGUMENT:")?;
        if bytes.len()>16384{return Err("BROWSER_ARGUMENT:".into())}bytes.push(b'\n');
        self.input.write_all(&bytes).and_then(|_|self.input.flush()).map_err(|_|"BROWSER_RUNTIME:")?;
        let deadline=Instant::now()+Duration::from_secs(40);
        loop {
            if epoch.load(Ordering::SeqCst)!=expected{return Err("BROWSER_CANCELLED:".into())}
            if Instant::now()>deadline{return Err("BROWSER_TIMEOUT:".into())}
            match self.output.recv_timeout(Duration::from_millis(50)) {
                Ok(result)=>{let value=result?;if value["id"].as_u64()!=Some(self.sequence){return Err("BROWSER_RESULT:".into())}if value["ok"]==true{return Ok(value["data"].clone())}let code=value["error"].as_str().unwrap_or("BROWSER_RUNTIME");return Err(match code {"BROWSER_BUSY"|"BROWSER_LOGIN_ACTIVE"|"BROWSER_MANAGED_LOGIN"|"BROWSER_STALE"|"BROWSER_TAB_CHANGED"|"BROWSER_SITE_PERMISSION"|"BROWSER_PAGE_PENDING"|"BROWSER_PAGE_OPEN"|"BROWSER_ARGUMENT"=>format!("{code}:"),_=>"BROWSER_MANAGED_FAILED:".into()})},
                Err(mpsc::RecvTimeoutError::Timeout)=>continue,
                Err(_)=>return Err("BROWSER_RUNTIME:".into()),
            }
        }
    }
}
impl Drop for Worker{fn drop(&mut self){self._job.stop();let _=self.child.kill();let _=self.child.wait();}}
