export function origin(raw:string):string
export function pageUrl(raw:string,site:string):string
export function publicAddress(address:string):boolean
export function networkPolicy(sites:string[]):(route:{request():{url():string;isNavigationRequest():boolean};abort(reason?:string):Promise<unknown>;continue():Promise<unknown>})=>Promise<unknown>
export function interaction(value:unknown):{observationId:string;elementId:string;operation:string;query?:string}
export const operations:string[]
