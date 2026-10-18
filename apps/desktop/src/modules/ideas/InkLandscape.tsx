import { useId } from 'react'

export function InkLandscape() {
  const id = useId().replaceAll(':', '')
  return <svg className="idea-landscape" viewBox="0 0 1000 300" fill="none" aria-hidden="true">
    <defs><linearGradient id={`${id}-wash`} x1="500" y1="30" x2="500" y2="290" gradientUnits="userSpaceOnUse"><stop stopColor="currentColor" stopOpacity=".35" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient><filter id={`${id}-grain`} x="-8%" y="-15%" width="116%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".028" numOctaves="3" seed="12" result="grain" /><feDisplacementMap in="SourceGraphic" in2="grain" scale="11" /></filter></defs>
    <g filter={`url(#${id}-grain)`} fill={`url(#${id}-wash)`}>
      <path d="M0 264 Q72 232 140 181 Q184 142 216 177 Q263 222 308 200 Q370 163 412 86 Q446 32 482 99 Q525 173 574 160 Q638 107 674 125 Q735 176 784 162 Q840 115 872 139 Q937 212 1000 190 V300 H0Z" opacity=".34" />
      <path d="M340 300 Q409 264 478 218 Q520 186 555 216 Q587 238 620 220 Q673 180 707 198 Q746 221 786 210 Q830 192 863 214 Q932 245 1000 224 V300Z" opacity=".52" />
      <path d="M0 255 Q58 257 112 221 Q147 196 174 214 Q208 242 255 240 Q302 235 345 265 L400 300 H0Z" opacity=".65" />
    </g>
    <path d="M107 266 Q235 254 343 271 M606 273 Q722 262 852 272" stroke="currentColor" opacity=".09" strokeLinecap="round" />
    <circle cx="748" cy="82" r="16" className="idea-landscape-sun" />
    <path d="M654 102 l7 -3 6 3 M679 92 l5 -2 5 2" stroke="currentColor" opacity=".24" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
}
