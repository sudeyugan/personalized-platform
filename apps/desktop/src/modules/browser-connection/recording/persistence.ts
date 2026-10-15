import { useLibraryStore } from '../../../state/useLibraryStore'
export function waitForMethodSave(id:string,revision:number,signal:AbortSignal) {
  return new Promise<void>((resolve,reject)=>{
    let unsubscribe=()=>{},timer:ReturnType<typeof setTimeout>|undefined,finished=false
    const finish=(error?:Error)=>{if(finished)return;finished=true;unsubscribe();clearTimeout(timer);signal.removeEventListener('abort',cancel);if(error)reject(error);else resolve()}
    const cancel=()=>finish(new Error('已停止等待保存；已发出的本地保存不能撤回，请在方法册核对。'))
    const check=()=>{
      const state=useLibraryStore.getState(),method=state.data.companion.operations?.find(item=>item.id===id)
      if(!method||method.revision!==revision)return finish(new Error('方法已修改或删除，请到方法册核对。'))
      if(state.saveStatus==='error')finish(new Error('本地保存失败，示范预览仍保留；可重试，不会复制新方法。'))
      else if(state.saveStatus==='saved')finish()
    }
    unsubscribe=useLibraryStore.subscribe(check)
    timer=setTimeout(()=>finish(new Error('保存尚未确认，示范预览仍保留；请稍后重试或在方法册核对。')),15000)
    signal.addEventListener('abort',cancel,{once:true})
    if(signal.aborted)cancel();else check()
  })
}
