import { useId } from 'react'

// Original vector landscape. Texture filters are bounded to painted shapes,
// not text. No animation loop, raster downloads or screen-sized canvas.
export function InkLandscape() {
  const id = useId().replaceAll(':', '')
  return <div className="idea-atmosphere" aria-hidden="true">
    <svg className="idea-paper-grain" width="100%" height="100%"><filter id={`${id}-paper`}><feTurbulence type="fractalNoise" baseFrequency=".62 .19" numOctaves="3" seed="21" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter><rect width="100%" height="100%" filter={`url(#${id}-paper)`} opacity=".32" /></svg>
    <svg className="idea-landscape" viewBox="0 0 1400 1000" fill="none" preserveAspectRatio="xMidYMin slice">
      <defs>
        <linearGradient id={`${id}-far`} x1="850" y1="70" x2="850" y2="530" gradientUnits="userSpaceOnUse"><stop stopColor="currentColor" stopOpacity=".27" /><stop offset=".65" stopColor="currentColor" stopOpacity=".08" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${id}-near`} x1="1100" y1="120" x2="1080" y2="650" gradientUnits="userSpaceOnUse"><stop stopColor="currentColor" stopOpacity=".48" /><stop offset=".5" stopColor="currentColor" stopOpacity=".19" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${id}-shore`} x1="100" y1="600" x2="130" y2="970" gradientUnits="userSpaceOnUse"><stop stopColor="currentColor" stopOpacity=".04" /><stop offset=".5" stopColor="currentColor" stopOpacity=".18" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient>
        <filter id={`${id}-edge`} x="-5%" y="-8%" width="110%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".018 .048" numOctaves="3" seed="17" result="fiber" /><feDisplacementMap in="SourceGraphic" in2="fiber" scale="9" /></filter>
        <filter id={`${id}-dry`} x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".19 .4" numOctaves="2" seed="9" result="noise" /><feColorMatrix in="noise" type="luminanceToAlpha" /><feComponentTransfer result="dry"><feFuncA type="linear" slope="3" intercept="-1" /></feComponentTransfer><feComposite in="SourceGraphic" in2="dry" operator="in" /></filter>
      </defs>
      <g className="idea-far-ridges" filter={`url(#${id}-edge)`} fill={`url(#${id}-far)`}>
        <path d="M490 385 Q556 329 585 292 L609 307 L654 232 L680 262 Q715 206 755 173 L778 193 L816 149 Q842 123 857 168 L885 204 L919 185 L948 229 Q994 169 1025 181 L1060 230 L1101 204 Q1147 152 1176 182 L1208 211 L1242 180 L1300 247 L1400 193 V580 H490Z" />
        <path d="M315 441 Q406 390 460 362 L486 391 L541 352 L581 400 L634 365 L686 417 L740 363 L801 412 L875 366 L934 399 L1012 373 L1087 433 L1199 375 L1293 420 L1400 361 V600 H315Z" opacity=".5" />
      </g>
      <g className="idea-near-ridges" fill={`url(#${id}-near)`} filter={`url(#${id}-edge)`}>
        <path d="M1000 511 Q1028 430 1055 409 L1080 375 L1103 393 L1128 319 L1143 333 L1170 249 L1189 223 L1205 263 L1221 269 L1246 352 L1268 331 L1292 379 L1309 376 L1340 449 L1366 418 L1400 460 V700 H1000Z" />
        <path d="M1180 503 L1210 437 L1231 452 L1256 395 L1278 408 L1304 352 L1324 381 L1352 306 L1380 328 L1400 312 V760 H1180Z" opacity=".75" />
      </g>
      <g className="idea-mountain-bones" stroke="currentColor" strokeLinecap="round" opacity=".17" filter={`url(#${id}-dry)`}>
        <path d="M1187 239 L1179 304 L1152 359 L1161 383 L1125 449 M1190 280 L1205 327 L1195 389 L1219 440 M1260 359 L1240 391 L1248 413 M1354 318 L1343 376 L1320 421" strokeWidth="8" />
        <path d="M1163 353 L1141 389 M1198 362 L1174 410 M1227 449 L1210 482 M1286 406 L1272 444 M1332 402 L1318 465" strokeWidth="3" />
        <g strokeWidth="2.3" opacity=".75"><path d="M1178 291 q-8 24 -6 34 t-13 31 M1187 307 q-3 21 -12 39 M1163 370 q-12 14 -18 39 M1157 391 q-7 21 -19 35 M1194 335 q8 21 1 44 t11 28 M1203 374 q-4 18 10 43 M1183 412 q-9 12 -12 28 M1213 435 q8 18 3 37 M1233 428 q-13 22 -10 39 M1254 384 q-10 13 -7 31 M1264 409 q-9 12 -11 33 M1288 408 q2 20 -11 44 M1347 355 q-9 17 -8 38 M1339 387 q-14 28 -12 48 M1321 431 q-9 13 -13 33 M1362 365 q-3 22 7 35 M1370 411 q-9 21 -7 42" /></g>
      </g>
      <g className="idea-lower-shore" fill={`url(#${id}-shore)`} filter={`url(#${id}-edge)`}><path d="M0 617 Q40 641 63 682 L81 665 L110 713 L135 699 Q171 735 202 749 L239 788 Q272 813 310 826 L368 870 V1000 H0Z" /><path d="M0 764 Q55 750 91 790 L121 777 Q159 810 207 828 L251 879 V1000 H0Z" opacity=".6" /></g>
      <g stroke="currentColor" strokeLinecap="round" className="idea-water-lines"><path d="M947 554 Q1070 538 1217 551 M1080 570 Q1191 560 1390 573 M49 864 Q179 847 287 864 M86 884 Q172 875 224 882" opacity=".11" /><path d="M1151 591 L1268 591 M1303 588 L1368 590 M265 892 L329 895" opacity=".09" /></g>
      <circle className="idea-landscape-sun" cx="1063" cy="155" r="25" />
      <g stroke="currentColor" strokeLinecap="round" opacity=".26"><path d="M947 227 q8 -7 16 0 M974 211 q6 -5 12 0 M1001 219 q4 -4 9 0" strokeWidth="1.2" /></g>
      <g className="idea-lone-boat" stroke="currentColor" strokeLinecap="round" opacity=".26"><path d="M1136 617 Q1157 625 1181 617 M1156 616 L1159 597 M1159 599 L1170 612" strokeWidth="1.5" /><path d="M1126 628 Q1156 625 1196 628" opacity=".4" /></g>
    </svg>
    <span className="idea-atmosphere-poem">墨有浓淡<br />念有回声</span>
  </div>
}
