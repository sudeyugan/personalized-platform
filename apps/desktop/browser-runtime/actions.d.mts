import type { Page,ElementHandle,Frame } from 'playwright-core'
export interface ActionObservation {
  value?:{loading?:boolean;loginState?:string};observationId:string;url:string;created:number
  refs:Map<string,{scroll?:boolean;handle?:ElementHandle;info?:unknown;frame?:Frame;document?:ElementHandle;url?:string}>
}
export function act(page:Page,observation:ActionObservation|undefined,raw:{observationId:string;elementId:string;operation:string;query?:string}):Promise<Page|undefined>
