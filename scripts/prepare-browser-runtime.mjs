import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new Error('Browser runtime preparation requires normal TLS verification')
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),desktop=join(root,'apps/desktop'),output=join(desktop,'src-tauri/browser-runtime')
const require=createRequire(join(desktop,'package.json')), {zipSync}=require('fflate')
const nodeVersion='24.19.0',nodeHash='3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
await mkdir(output,{recursive:true})
const cache=join(output,`node-${nodeVersion}-win-x64.exe`)
let node=await readFile(cache).catch(()=>null)
if(!node||sha(node)!==nodeHash) {
  const response=await fetch(`https://nodejs.org/download/release/v${nodeVersion}/win-x64/node.exe`,{signal:AbortSignal.timeout(120000)})
  if(!response.ok)throw new Error('Cannot download pinned browser runtime')
  node=Buffer.from(await response.arrayBuffer())
  if(sha(node)!==nodeHash)throw new Error('Browser runtime SHA-256 mismatch')
  await writeFile(cache,node)
}
const files={'node.exe':new Uint8Array(node)}
files['licenses/Node-LICENSE.txt']=new Uint8Array(await readFile(join(root,`docs/licenses/node-${nodeVersion}-LICENSE.txt`)))
async function collect(directory,prefix) {
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    // pnpm may inject platform-specific CLI shims inside the installed package.
    // Only package files belong in the executable runtime, not install tooling.
    if(entry.name==='node_modules')continue
    if(entry.isSymbolicLink())throw new Error('Runtime archive must not contain symbolic links')
    const path=join(directory,entry.name),name=`${prefix}/${entry.name}`
    if(entry.isDirectory())await collect(path,name)
    else if(entry.isFile())files[name]=new Uint8Array(await readFile(path))
  }
}
await collect(join(desktop,'browser-runtime'),'engine')
const playwright=dirname(require.resolve('playwright-core/package.json'))
await collect(playwright,'node_modules/playwright-core')
files['manifest.json']=new TextEncoder().encode(JSON.stringify({version:1,nodeVersion,files:Object.entries(files).map(([path,bytes])=>({path,sha256:sha(bytes),size:bytes.length}))}))
const fingerprint=sha(Buffer.concat(Object.entries(files).map(([name,bytes])=>Buffer.concat([Buffer.from(name),Buffer.from(bytes)]))))
if((await readFile(join(output,'source.sha256'),'utf8').catch(()=>''))!==fingerprint || !(await stat(join(output,'runtime.zip')).catch(()=>null))) {
  await writeFile(join(output,'runtime.zip'),zipSync(files,{level:6,mtime:new Date('2026-01-01T00:00:00Z')}))
  await writeFile(join(output,'source.sha256'),fingerprint)
}
console.log(`Prepared dedicated browser runtime (${Object.keys(files).length} files; Node ${nodeVersion}, Playwright ${JSON.parse(await readFile(join(playwright,'package.json'),'utf8')).version}).`)
