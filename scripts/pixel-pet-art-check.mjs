// Read-only RGBA PNG evidence. Never modifies/re-encodes artwork.
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
const root = new URL('../apps/desktop/src/modules/companion/pixel-pet/', import.meta.url)
function rgba(file) {
  const b=readFileSync(file), width=b.readUInt32BE(16), height=b.readUInt32BE(20)
  if(b[24]!==8||b[25]!==6||b[28]!==0)throw new Error('Expected non-interlaced 8-bit RGBA PNG')
  const chunks=[]
  for(let at=8;at<b.length;){const size=b.readUInt32BE(at),type=b.toString('ascii',at+4,at+8);if(type==='IDAT')chunks.push(b.subarray(at+8,at+8+size));at+=12+size}
  const raw=inflateSync(Buffer.concat(chunks)), stride=width*4, pixels=Buffer.alloc(stride*height)
  const paeth=(a,c,d)=>{const p=a+c-d,pa=Math.abs(p-a),pc=Math.abs(p-c),pd=Math.abs(p-d);return pa<=pc&&pa<=pd?a:pc<=pd?c:d}
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)],offset=y*stride
    for(let x=0;x<stride;x++){
      const left=x>=4?pixels[offset+x-4]:0,up=y?pixels[offset+x-stride]:0,corner=y&&x>=4?pixels[offset+x-stride-4]:0
      const predict=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,corner):NaN
      if(!Number.isFinite(predict))throw new Error('Invalid PNG filter')
      pixels[offset+x]=(raw[y*(stride+1)+1+x]+predict)&255
    }
  }
  return {width,height,pixels}
}
const base=rgba(new URL('art/assets/pixel-free-v1.png',root))
for(const pose of ['wave','touch-hair','chin','stretch','sleep']){
  const art=rgba(new URL(`v2/rig/assets/${pose}-v3.png`,root))
  if(art.width!==1024||art.height!==1536)throw new Error(`${pose}: dimensions mismatch`)
  let transparent=0,partial=0,error=0,count=0
  for(let i=3;i<art.pixels.length;i+=4){if(art.pixels[i]===0)transparent++;else if(art.pixels[i]<255)partial++}
  // Crown/forehead (above the changed hands/eyelids), not an identity guarantee.
  for(let y=80;y<350;y++)for(let x=320;x<740;x++){
    const i=(y*art.width+x)*4;if(base.pixels[i+3]<200)continue
    for(let c=0;c<3;c++){error+=Math.abs(art.pixels[i+c]-base.pixels[i+c]);count++}
  }
  if(!transparent)throw new Error(`${pose}: no truly transparent pixels`)
  console.log(JSON.stringify({pose,width:art.width,height:art.height,transparent,partial,foreheadMeanAbsoluteRGBError:Number((error/count).toFixed(3))}))
}
