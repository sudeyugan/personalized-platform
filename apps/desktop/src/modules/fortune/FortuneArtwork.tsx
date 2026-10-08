import type { FortuneKind } from '../../domain/fortune'

/** Code-native botanical ornament; no remote asset, texture or font requests. */
export function FortuneArtwork({ kind }: { kind?: FortuneKind }) {
  return <svg className="fortune-garden" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    {kind === 'love' && <g className="fortune-cherry" fill="none" stroke="currentColor">
      <path d="M1190 8Q1050 75 992 211T869 382M1070 90L943 64M1018 155L1120 133M973 259L862 230" strokeWidth="2" />
      {[ [943, 64], [1018, 155], [1120, 133], [862, 230], [936, 305] ].map(([x, y]) => <g key={x} transform={`translate(${x} ${y})`}>
        {[0, 72, 144, 216, 288].map((angle) => <path key={angle} transform={`rotate(${angle})`} d="M0 0C-17-12-16-29-4-29L0-24L4-29C16-29 17-12 0 0Z" fill="currentColor" strokeWidth=".5" />)}
        <circle r="3" fill="#c69a68" stroke="none" />
      </g>)}
      <path d="M97 638Q82 611 105 601Q117 626 97 638ZM1065 413Q1061 389 1081 380Q1090 402 1065 413Z" fill="currentColor" />
    </g>}
    {kind === 'future' && <g className="fortune-bamboo" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M1153 900V50M1116 900V148M74 900V373M107 900V477M1145 178h16M1145 377h16M1145 588h16M1145 774h16M1108 307h16M1108 499h16M1108 692h16M66 486h16M66 649h16M66 804h16M99 581h16M99 764h16" />
      <g fill="currentColor" stroke="none"><path d="M1153 310Q1070 205 1077 300Q1103 335 1153 310ZM1153 502Q1196 394 1216 416Q1221 469 1153 502ZM1116 698Q1018 612 1028 695Q1059 726 1116 698ZM74 538Q16 450 19 520Q29 553 74 538ZM107 672Q185 595 172 658Q149 689 107 672Z" /></g>
      <circle cx="927" cy="143" r="58" className="fortune-gold-ring" strokeWidth="1" />
    </g>}
    <g className={`fortune-ink${kind && kind !== 'daily' ? ' fortune-quiet-branch' : ''}`} fill="none" stroke="currentColor" strokeLinecap="round">
      <path d="M1220 12C1080 36 1018 113 972 222S918 364 856 402" strokeWidth="3" />
      <path d="M1065 89Q995 60 926 83M1008 150Q1101 120 1154 161M966 237Q876 191 824 215M941 299Q1018 271 1056 306" strokeWidth="1.7" />
      <path d="M-20 774C93 783 147 753 196 692S241 596 278 554" strokeWidth="2.8" />
      <path d="M106 762Q81 692 101 655M170 723Q229 740 280 718M213 665Q158 633 158 591M247 598Q310 616 345 595" strokeWidth="1.6" />
    </g>
    <g className={`fortune-leaves${kind && kind !== 'daily' ? ' fortune-quiet-branch' : ''}`} fill="currentColor">
      <path d="M927 83Q912 38 871 45Q881 83 927 83ZM958 78Q933 112 903 102Q917 75 958 78ZM1042 100Q1028 54 990 58Q992 94 1042 100ZM1094 139Q1101 91 1135 97Q1130 135 1094 139ZM1128 151Q1156 191 1186 170Q1166 143 1128 151ZM824 215Q812 171 771 184Q783 218 824 215ZM876 213Q867 259 837 249Q846 216 876 213ZM989 285Q1001 245 1032 253Q1025 281 989 285ZM1056 306Q1085 332 1107 305Q1084 290 1056 306Z" />
      <path d="M101 655Q68 634 53 659Q76 679 101 655ZM94 699Q120 671 139 691Q123 718 94 699ZM232 735Q249 696 277 709Q267 740 232 735ZM158 591Q131 565 109 585Q129 610 158 591ZM179 641Q202 613 223 632Q213 655 179 641ZM310 606Q324 574 348 583Q341 611 310 606Z" />
    </g>
    <g className={`fortune-blossoms${kind && kind !== 'daily' ? ' fortune-quiet-branch' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M887 131c-23-20-23 10 0 0c-10 23 20 23 0 0c23 10 23-20 0 0c10-23-20-23 0 0ZM115 584c-20-18-20 9 0 0c-9 20 18 20 0 0c20 9 20-18 0 0c9-20-18-20 0 0Z" />
    </g>
  </svg>
}
