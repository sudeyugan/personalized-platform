import { block, palette as p, polygon } from './pixelPrimitives'

export function torso(ctx: CanvasRenderingContext2D) {
  polygon(ctx, p.skinOutline, [[122,117],[144,117],[146,129],[160,132],[174,144],[176,174],[174,217],[178,239],[102,239],[98,204],[97,159],[105,138],[120,130]])
  polygon(ctx, p.skin, [[124,117],[141,117],[142,130],[158,135],[163,149],[113,149],[108,138],[122,132]])
  polygon(ctx, p.skinLight, [[125,121],[138,121],[138,131],[151,137],[145,145],[124,142],[116,136],[125,131]])
  block(ctx, p.ink, 122, 121, 23, 5)
  block(ctx, p.inkLight, 124, 122, 19, 1)
  polygon(ctx, p.hairMid, [[132,125],[137,128],[134,133],[130,129]])
  polygon(ctx, p.ink, [[132,127],[135,128],[134,131],[131,129]])
  polygon(ctx, p.clothShadow, [[115,134],[126,134],[135,140],[147,132],[158,136],[166,155],[170,190],[167,213],[178,239],[103,239],[101,212],[106,174],[104,150]])
  polygon(ctx, p.white, [[117,137],[130,139],[136,147],[147,136],[157,140],[161,158],[165,187],[161,215],[171,239],[110,239],[108,212],[114,182],[111,153]])
  polygon(ctx, p.clothMid, [[134,155],[139,152],[138,188],[143,210],[151,231],[150,239],[141,219],[134,189]])
  polygon(ctx, p.clothShadow, [[115,171],[114,189],[108,212],[112,227],[118,214],[115,199],[119,179]])
  polygon(ctx, p.clothMid, [[153,154],[161,178],[164,190],[157,198],[161,178]])
  // White pointed collar over the black ribbon, as in the reference blouse.
  polygon(ctx, p.outline, [[117,133],[132,139],[135,145],[126,153],[114,139]])
  polygon(ctx, p.white, [[119,134],[131,140],[132,144],[126,150],[117,139]])
  polygon(ctx, p.outline, [[147,132],[158,136],[150,153],[137,145]])
  polygon(ctx, p.white, [[147,134],[156,137],[149,150],[140,145]])
  polygon(ctx, p.ink, [[123,151],[133,145],[139,150],[148,147],[154,157],[140,156],[135,159],[130,155],[119,157]])
  polygon(ctx, p.inkLight, [[125,151],[132,148],[132,152],[123,154]])
  polygon(ctx, p.inkLight, [[140,151],[148,150],[151,155],[141,154]])
  polygon(ctx, p.ink, [[132,158],[136,157],[137,179],[133,183],[130,175]])
  polygon(ctx, p.ink, [[139,158],[142,157],[149,179],[145,183],[139,172]])
  block(ctx, p.hairMid, 116, 147, 2, 2)
  block(ctx, p.blueDeep, 150, 145, 2, 2)
  for (const y of [185,199,211]) { block(ctx, p.clothShadow, 139, y, 2, 2); block(ctx, p.white, 139, y, 1, 1) }
  // Narrow waist strap and buckle; no legs or full-body costume.
  polygon(ctx, p.ink, [[107,211],[161,207],[167,213],[109,219]])
  polygon(ctx, p.inkLight, [[109,213],[161,209],[163,211],[110,216]])
  block(ctx, p.hairMid, 131, 210, 12, 6)
  block(ctx, p.ink, 133, 212, 8, 2)
  polygon(ctx, p.blue, [[145,214],[151,218],[155,238],[149,238]])
}

export function leftArm(ctx: CanvasRenderingContext2D) {
  // Bare shoulder and detached puff sleeve rather than one angular white bar.
  polygon(ctx, p.skinOutline, [[105,135],[115,137],[118,148],[112,157],[100,154],[98,145]])
  polygon(ctx, p.skin, [[105,137],[112,139],[114,147],[109,153],[102,151],[101,145]])
  polygon(ctx, p.skinLight, [[105,138],[111,140],[110,147],[103,147]])
  polygon(ctx, p.outline, [[98,150],[113,151],[119,164],[127,169],[147,155],[173,144],[183,146],[187,155],[169,162],[147,174],[126,183],[115,181],[105,172],[96,164]])
  polygon(ctx, p.clothShadow, [[100,152],[112,153],[116,165],[126,173],[147,159],[173,148],[181,148],[183,154],[167,158],[147,171],[125,180],[116,178],[107,169],[99,163]])
  polygon(ctx, p.white, [[104,155],[111,155],[112,168],[125,176],[147,164],[170,153],[178,151],[175,156],[146,169],[125,178],[116,173],[105,165]])
  polygon(ctx, p.clothMid, [[100,158],[104,160],[109,170],[116,175],[111,175],[103,166]])
  polygon(ctx, p.ink, [[98,148],[113,149],[115,155],[99,154]])
  polygon(ctx, p.inkLight, [[100,149],[111,150],[111,152],[101,151]])
  polygon(ctx, p.blueDeep, [[100,155],[106,158],[114,154],[115,161],[107,163],[101,168],[99,163]])
  polygon(ctx, p.blue, [[101,157],[106,160],[103,164],[100,162]])
  polygon(ctx, p.blue, [[108,159],[112,156],[113,160],[108,162]])
  block(ctx, p.blueDeep, 105, 159, 3, 3)
  polygon(ctx, p.ink, [[171,144],[179,142],[185,151],[181,157],[174,157]])
  polygon(ctx, p.white, [[173,146],[178,145],[181,151],[179,154],[176,154]])
}

export function rightArm(ctx: CanvasRenderingContext2D) {
  polygon(ctx, p.skinOutline, [[157,136],[166,137],[172,144],[171,154],[163,160],[157,152]])
  polygon(ctx, p.skin, [[160,138],[166,139],[169,145],[168,151],[162,155],[160,149]])
  polygon(ctx, p.outline, [[164,153],[174,151],[179,159],[176,176],[183,184],[191,185],[191,199],[180,200],[170,191],[161,176],[159,163]])
  polygon(ctx, p.clothShadow, [[166,155],[172,154],[176,160],[173,177],[180,187],[188,187],[188,197],[181,197],[172,189],[164,175],[162,164]])
  polygon(ctx, p.white, [[166,157],[171,157],[172,167],[170,176],[177,187],[180,191],[177,191],[167,176],[164,164]])
  polygon(ctx, p.ink, [[163,151],[175,149],[177,155],[165,157]])
  polygon(ctx, p.ink, [[181,182],[191,185],[191,198],[181,196],[178,190]])
  block(ctx, p.hairMid, 183, 185, 5, 2)
  polygon(ctx, p.blue, [[181,186],[186,189],[185,193],[181,191]])
}

function grippingHand(ctx: CanvasRenderingContext2D, y: number) {
  polygon(ctx, p.skinOutline, [[182,y+3],[187,y],[192,y],[192,y+15],[187,y+16],[181,y+12],[179,y+7]])
  polygon(ctx, p.skin, [[183,y+4],[188,y+1],[192,y+1],[192,y+14],[187,y+14],[182,y+11],[181,y+7]])
  polygon(ctx, p.skinLight, [[184,y+4],[189,y+2],[192,y+2],[192,y+5],[187,y+6],[184,y+10],[183,y+8]])
  // Curled fingers stay fixed on the edge while the body breathes.
  for (let finger = 0; finger < 3; finger++) {
    block(ctx, p.skinOutline, 188, y + 5 + finger * 3, 4, 1)
    block(ctx, p.skinLight, 189, y + 6 + finger * 3, 3, 1)
  }
  block(ctx, p.blue, 185, y + 9, 2, 1)
}
export function leftHand(ctx: CanvasRenderingContext2D) { grippingHand(ctx, 140) }
export function rightHand(ctx: CanvasRenderingContext2D) { grippingHand(ctx, 184) }
