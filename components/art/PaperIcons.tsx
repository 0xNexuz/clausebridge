// Small torn-paper illustrations for the "how it works" cards. Original, drawn with SVG and a shared tear filter.
const INK = '#2A2623';

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <filter id={`${id}-t`} x="-8%" y="-8%" width="116%" height="116%">
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="5" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  );
}

const strokes = (x: number, y: number) => (
  <g stroke={INK} strokeWidth="4.5" strokeLinecap="round">
    <line x1={x} y1={y} x2={x + 10} y2={y - 14} />
    <line x1={x + 10} y1={y + 12} x2={x + 26} y2={y + 2} />
    <line x1={x + 14} y1={y + 28} x2={x + 30} y2={y + 26} />
  </g>
);

export function UploadIcon() {
  return (
    <svg viewBox="0 0 160 140" className="paper-icon" aria-hidden>
      <Defs id="up" />
      <g filter="url(#up-t)">
        <rect x="26" y="34" width="78" height="92" fill="#C9BFA9" transform="rotate(-8 26 34)" />
        <path d="M44 22 H 104 L 120 38 V 118 H 44 Z" fill="#F4EFE4" />
        <path d="M104 22 L 120 38 H 104 Z" fill="#D9CFBC" />
        <rect x="56" y="50" width="48" height="6" fill="#B9AE98" />
        <rect x="56" y="64" width="52" height="6" fill="#F4D35E" />
        <rect x="56" y="78" width="40" height="6" fill="#B9AE98" />
        <rect x="56" y="92" width="46" height="6" fill="#B9AE98" />
      </g>
      {strokes(124, 30)}
    </svg>
  );
}

export function ConfirmIcon() {
  return (
    <svg viewBox="0 0 160 140" className="paper-icon" aria-hidden>
      <Defs id="ok" />
      <g filter="url(#ok-t)">
        <rect x="28" y="40" width="96" height="78" fill="#F4EFE4" transform="rotate(4 28 40)" />
        <circle cx="78" cy="80" r="30" fill="none" stroke="#B23A2B" strokeWidth="5" />
        <path d="M62 80 L 74 92 L 96 66" fill="none" stroke="#B23A2B" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="88" y="10" width="26" height="30" rx="4" fill="#6B4B2E" transform="rotate(18 88 10)" />
        <rect x="80" y="36" width="40" height="12" rx="3" fill="#3B3632" transform="rotate(18 80 36)" />
      </g>
      {strokes(124, 70)}
    </svg>
  );
}

export function TrackIcon() {
  return (
    <svg viewBox="0 0 160 140" className="paper-icon" aria-hidden>
      <Defs id="tr" />
      <g filter="url(#tr-t)">
        <rect x="30" y="30" width="96" height="92" rx="6" fill="#F4EFE4" transform="rotate(-6 30 30)" />
        <rect x="30" y="30" width="96" height="22" rx="4" fill="#3B3632" transform="rotate(-6 30 30)" />
        <g transform="rotate(-6 30 30)">
          {[0, 1, 2, 3].flatMap(row => [0, 1, 2, 3].map(col => (
            <rect key={`${row}-${col}`} x={40 + col * 20} y={60 + row * 15} width="13" height="10" fill={row === 2 && col === 2 ? '#D9A520' : '#B9B0A0'} />
          )))}
          <circle cx="86" cy="95" r="12" fill="none" stroke="#B23A2B" strokeWidth="3.5" />
          <rect x="46" y="22" width="6" height="16" rx="3" fill="#6E6A64" />
          <rect x="102" y="22" width="6" height="16" rx="3" fill="#6E6A64" />
        </g>
      </g>
      {strokes(128, 46)}
    </svg>
  );
}

export function ReportIcon() {
  return (
    <svg viewBox="0 0 160 140" className="paper-icon" aria-hidden>
      <Defs id="rp" />
      <g filter="url(#rp-t)">
        <rect x="40" y="18" width="80" height="106" fill="#F4EFE4" transform="rotate(5 40 18)" />
        <g transform="rotate(5 40 18)">
          <rect x="52" y="32" width="56" height="7" fill="#3B3632" />
          <rect x="52" y="46" width="44" height="5" fill="#B9AE98" />
          <rect x="56" y="88" width="12" height="20" fill="#5F7F4A" />
          <rect x="72" y="74" width="12" height="34" fill="#D9A520" />
          <rect x="88" y="64" width="12" height="44" fill="#3F6EA5" />
        </g>
        <path d="M44 14 q -10 0 -10 12 v 30 q 0 8 8 8 q 8 0 8 -8 v -28" fill="none" stroke="#7E7A73" strokeWidth="4" />
      </g>
      {strokes(126, 40)}
    </svg>
  );
}
