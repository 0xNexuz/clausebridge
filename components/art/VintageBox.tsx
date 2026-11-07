// An original, distressed vintage stationery box: "ClauseBridge" highlighters, one pen per kind of promise.
// The four pen colours are the obligation colours used throughout the app.

export const PENS = [
  { label: 'Deliverable', color: '#3F6EA5', top: 58 },
  { label: 'Payment', color: '#D9A520', top: 34 },
  { label: 'Deadline', color: '#B23A2B', top: 70 },
  { label: 'Responsibility', color: '#5F7F4A', top: 46 },
];

const INK = '#2A2623';
const RED = '#B23A2B';
const CREAM = '#EFE6D2';

export default function VintageBox({ id = 'box', className, title = 'A vintage ClauseBridge box of four highlighter pens', width, height }: {
  id?: string; className?: string; title?: string; width?: number; height?: number }) {
  const f = (name: string) => `url(#${id}-${name})`;
  return (
    <svg className={className} viewBox="0 0 330 490" width={width} height={height} role="img" aria-label={title}>
      <defs>
        <filter id={`${id}-wobble`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" />
        </filter>
        <filter id={`${id}-wear`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="11" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.96  0 0 0 0 0.93  0 0 0 0 0.86  0 0 0 16 -11.6" result="spots" />
          <feComposite in="spots" in2="SourceAlpha" operator="in" result="worn" />
          <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="worn" /></feMerge>
        </filter>
      </defs>
      <g filter={f('wobble')} stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
        <g filter={f('wear')}>
          {/* open lid, tipped back */}
          <path d="M44 74 L256 52 L270 140 L58 162 Z" fill={RED} />
          <path d="M58 150 L268 128 L270 140 L58 162 Z" fill="#8E2B20" />
          <text x="150" y="104" transform="rotate(-6 150 104)" fontFamily="'Courier Prime', monospace" fontSize="10.5" letterSpacing="2.5" fill={CREAM} stroke="none" textAnchor="middle">CLAUSEBRIDGE · FINE MARKERS</text>
          {/* pens */}
          {PENS.map((pen, i) => {
            const x = 66 + i * 50;
            return (
              <g key={pen.label}>
                <rect x={x} y={pen.top + 70} width="42" height="210" rx="6" fill="#F6F1E6" />
                <rect x={x} y={pen.top + 70} width="42" height="128" rx="8" fill={pen.color} />
                <rect x={x} y={pen.top + 182} width="42" height="7" fill="#F6F1E6" />
                <text x={x + 26} y={pen.top + 176} transform={`rotate(-90 ${x + 26} ${pen.top + 176})`} fontFamily="'Courier Prime', monospace" fontSize="11.5"
                  fontWeight="700" letterSpacing="1" fill={CREAM} stroke="none">{pen.label.toUpperCase()}</text>
              </g>
            );
          })}
          {/* front panel with the cut-out */}
          <path d="M30 196 Q 56 196 66 214 Q 160 262 256 214 Q 266 196 292 196 L 292 466 L 30 466 Z" fill={CREAM} />
          {/* side panel */}
          <path d="M292 196 L 320 178 L 320 446 L 292 466 Z" fill="#D8CCB2" />
          <text x="312" y="440" transform="rotate(-90 312 440)" fontFamily="'Courier Prime', monospace" fontSize="9" letterSpacing="1.4" fill={RED} stroke="none">CONFIRMED TERMS. NO SURPRISES.</text>
          {/* bands */}
          <path d="M30 286 L292 286 L292 300 L30 300 Z" fill={RED} />
          <path d="M30 430 L292 430 L292 440 L30 440 Z" fill={RED} />
          <path d="M30 446 L292 446 L292 450 L30 450 Z" fill={RED} />
        </g>
        {/* crest: a bridge over a clause mark, with laurels and a ribbon */}
        <g transform="translate(161 344)" strokeWidth="1.8">
          {[-1, 1].map(side => (
            <g key={side} transform={`scale(${side} 1)`} fill="#7A8A45">
              {[0, 1, 2, 3, 4].map(k => (
                <ellipse key={k} cx={-33 - k * 1.5} cy={14 - k * 9} rx="4.6" ry="8" transform={`rotate(${-35 + k * 12} ${-33 - k * 1.5} ${14 - k * 9})`} />
              ))}
            </g>
          ))}
          <circle r="25" fill={CREAM} stroke={RED} strokeWidth="3" />
          <circle r="19" fill="none" stroke={RED} strokeWidth="1.2" />
          <path d="M-14 7 Q 0 -12 14 7" fill="none" stroke={INK} strokeWidth="2.6" />
          <path d="M-14 7 L -14 12 M 14 7 L 14 12 M -18 12 L 18 12" fill="none" stroke={INK} strokeWidth="2.2" />
          <text y="-3" fontFamily="'Source Serif 4 Variable', Georgia, serif" fontSize="12" fontWeight="800" fill={RED} stroke="none" textAnchor="middle">§</text>
          <path d="M-36 30 L 36 30 L 30 40 L 36 50 L -36 50 L -30 40 Z" fill={CREAM} />
          <text y="44" fontFamily="'Courier Prime', monospace" fontSize="9.5" fontWeight="700" letterSpacing="1.5" fill={INK} stroke="none" textAnchor="middle">EST. 2026</text>
        </g>
        <text x="161" y="414" fontFamily="'Source Serif 4 Variable', Georgia, serif" fontSize="38" fontWeight="800" letterSpacing="-0.5" fill={INK} stroke="none" textAnchor="middle">ClauseBridge</text>
        {/* rubber band */}
        <path d="M24 240 Q 160 252 296 236 L 322 220" fill="none" stroke="#C49B5E" strokeWidth="3.4" />
      </g>
    </svg>
  );
}
