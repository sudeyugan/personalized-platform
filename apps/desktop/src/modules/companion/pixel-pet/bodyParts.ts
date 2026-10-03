import { block, palette as p, polygon } from './pixelPrimitives'

export function torso(ctx: CanvasRenderingContext2D) {
  polygon(ctx, p.outline, [[125,120],[151,120],[155,138],[177,142],[188,156],[192,181],[192,240],[100,240],[95,192],[97,159],[109,142],[121,137]])
  polygon(ctx, p.skin, [[126,121],[148,123],[151,141],[140,153],[122,140]])
  block(ctx, p.ink, 123, 126, 29, 8)
  block(ctx, p.inkLight, 125, 127, 24, 2)
  polygon(ctx, p.clothShadow, [[110,143],[124,141],[141,151],[151,138],[171,146],[183,163],[192,199],[192,240],[104,240],[99,194],[101,162]])
  polygon(ctx, p.white, [[123,140],[136,153],[152,141],[166,150],[175,172],[177,214],[165,240],[112,240],[108,184],[113,159]])
  polygon(ctx, p.clothShadow, [[123,139],[135,148],[128,160],[115,148]])
  polygon(ctx, p.hairLight, [[124,138],[137,148],[128,154],[119,144]])
  polygon(ctx, p.hairLight, [[150,139],[145,150],[153,156],[164,148]])
  polygon(ctx, p.ink, [[127,152],[136,146],[142,153],[149,148],[159,160],[144,160],[139,170],[132,160],[120,162]])
  polygon(ctx, p.inkLight, [[128,154],[136,149],[134,157],[124,159]])
  polygon(ctx, p.inkLight, [[143,153],[148,151],[154,158],[144,157]])
  polygon(ctx, p.ink, [[136,162],[142,162],[146,184],[141,191],[134,181]])
  polygon(ctx, p.blue, [[147,171],[150,172],[163,221],[158,229]])
  polygon(ctx, p.clothShadow, [[111,167],[119,186],[113,223],[113,240],[106,240],[108,202]])
  polygon(ctx, p.ink, [[105,219],[173,211],[181,220],[111,230]])
  block(ctx, p.hairMid, 145, 217, 14, 8)
  block(ctx, p.ink, 148, 219, 8, 4)
  block(ctx, p.blue, 166, 209, 6, 4)
}
export function leftArm(ctx: CanvasRenderingContext2D) {
  polygon(ctx, p.outline, [[100,149],[116,154],[129,176],[156,166],[177,155],[186,167],[166,182],[132,196],[113,194],[94,169]])
  polygon(ctx, p.clothShadow, [[101,153],[114,157],[130,181],[158,170],[176,159],[181,168],[162,179],[130,191],[115,190],[98,168]])
  polygon(ctx, p.white, [[104,155],[111,158],[130,184],[158,174],[174,163],[175,169],[156,180],[129,188],[115,184],[101,166]])
  polygon(ctx, p.ink, [[167,159],[178,153],[188,166],[175,175]])
  polygon(ctx, p.blue, [[171,160],[178,157],[183,165],[176,170]])
  block(ctx, p.hairLight, 122, 183, 8, 2)
}
export function rightArm(ctx: CanvasRenderingContext2D) {
  polygon(ctx, p.outline, [[166,145],[181,148],[184,164],[179,187],[183,202],[192,209],[187,225],[175,219],[166,202],[161,181]])
  polygon(ctx, p.clothShadow, [[169,149],[178,152],[179,166],[173,188],[178,207],[187,211],[183,219],[175,215],[170,200],[166,179]])
  polygon(ctx, p.white, [[170,152],[175,154],[174,178],[169,190],[175,207],[172,199],[167,179]])
  polygon(ctx, p.ink, [[176,201],[190,207],[188,220],[175,214]])
  polygon(ctx, p.blue, [[179,205],[187,209],[186,214],[178,211]])
}
function grippingHand(ctx: CanvasRenderingContext2D, y: number) {
  polygon(ctx, p.outline, [[182,y+3],[188,y],[192,y],[192,y+18],[185,y+17],[179,y+12],[179,y+7]])
  polygon(ctx, p.skinShadow, [[183,y+4],[188,y+1],[192,y+1],[192,y+16],[186,y+15],[181,y+11],[181,y+7]])
  polygon(ctx, p.skinLight, [[184,y+5],[189,y+2],[192,y+2],[192,y+5],[187,y+6],[185,y+10],[189,y+12],[192,y+12],[192,y+15],[187,y+14],[182,y+10]])
  block(ctx, p.skin, 187, y + 6, 5, 6)
  for (let finger = 0; finger < 3; finger++) {
    block(ctx, p.skinShadow, 188, y + 6 + finger * 3, 4, 1)
    block(ctx, p.skinLight, 189, y + 7 + finger * 3, 3, 1)
  }
  block(ctx, p.blue, 185, y + 10, 2, 2)
}
export function leftHand(ctx: CanvasRenderingContext2D) { grippingHand(ctx, 152) }
export function rightHand(ctx: CanvasRenderingContext2D) { grippingHand(ctx, 207) }
