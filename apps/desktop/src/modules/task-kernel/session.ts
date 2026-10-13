export type ExecutionPhase = 'resolving' | 'clarifying' | 'preparing' | 'observing' | 'acting' | 'verifying' | 'verified' | 'handoff' | 'cancelled' | 'failed'
export type ExecutionDriver = 'application' | 'public_web' | 'browser' | 'window'
/** Shared state contract, not shared authority or persisted private results. */
export class ExecutionSession {
  readonly id=crypto.randomUUID()
  readonly driver:ExecutionDriver
  phase:ExecutionPhase='resolving'
  private steps=0
  private readonly expires:number
  private readonly maximum:number
  constructor(driver:ExecutionDriver,maximum=12,timeoutMs=180000){this.driver=driver;this.maximum=maximum;this.expires=Date.now()+timeoutMs}
  transition(phase:ExecutionPhase){
    if(['cancelled','failed','verified'].includes(this.phase))throw new Error('本次任务已经结束，不能继续操作')
    if(Date.now()>=this.expires)throw new Error('本次任务已过期，请重新发起')
    if(['preparing','observing','acting','verifying'].includes(phase)&&++this.steps>this.maximum)throw new Error('已达到任务步骤上限，停止继续执行')
    this.phase=phase
  }
  get snapshot(){return {id:this.id,driver:this.driver,phase:this.phase,steps:this.steps}}
}
