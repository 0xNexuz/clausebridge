'use client';
// The ClauseBridge hero: a torn-paper collage with a contract-page character whose eyes follow the
// cursor, a pixel-art reader reclining with a laptop, and the vintage highlighter box.

import { useEffect, useRef } from 'react';
import { READER } from './pixel-maps';
import { pixelRects } from './Pixel';
import VintageBox from './VintageBox';

const C = { mustard: '#E2B12F', denim: '#4572A8', denimLight: '#6E95C4', denimDark: '#365E90', cream: '#EFE8DB', beige: '#DCD2BF',
  sage: '#A3B593', forest: '#4E6B3A', kraft: '#B68B5E', ink: '#2A2623', marker: '#F4D35E' };

function PixelGroup({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} shapeRendering="crispEdges">
      {pixelRects(READER).map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={READER.colors[r.key as keyof typeof READER.colors]} />)}
    </g>
  );
}

export default function Collage() {
  const svg = useRef<SVGSVGElement>(null);
  const pupils = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        for (const pupil of pupils.current) {
          const eye = pupil?.parentElement?.querySelector('circle');
          if (!pupil || !eye) continue;
          const box = eye.getBoundingClientRect();
          const dx = event.clientX - (box.left + box.width / 2);
          const dy = event.clientY - (box.top + box.height / 2);
          const distance = Math.hypot(dx, dy) || 1;
          const reach = Math.min(1, distance / 260) * 17;
          pupil.style.transform = `translate(${(dx / distance) * reach}px, ${(dy / distance) * reach}px)`;
        }
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(frame); };
  }, []);

  return (
    <svg ref={svg} className="collage" viewBox="0 0 1200 620" preserveAspectRatio="xMidYMid slice" role="img"
      aria-label="A torn-paper collage: a blue contract-page character with googly eyes, a pixel-art person reading on a laptop, and a vintage box of highlighter pens">
      <defs>
        <filter id="torn" x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence type="fractalNoise" baseFrequency="0.032" numOctaves="4" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="11" xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="9" result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0.12  0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 -0.55 0.36" result="grainA" />
          <feComposite in="grainA" in2="rough" operator="in" result="fibre" />
          <feMerge><feMergeNode in="rough" /><feMergeNode in="fibre" /></feMerge>
        </filter>
        <filter id="tornEdge" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="rough" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="2" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
        </filter>
      </defs>

      <rect width="1200" height="620" fill={C.cream} />
      {/* background scraps: each torn shape sits on a paler copy of itself, the paper's white core */}
      <g className="settle" style={{ '--d': '0ms' } as React.CSSProperties}>
        <path filter="url(#tornEdge)" fill="#F6F1E7" d="M0 0 H430 L404 66 L338 128 L214 178 L92 258 L0 278 Z" />
        <path filter="url(#torn)" fill={C.mustard} d="M0 0 H420 L396 62 L330 122 L208 172 L88 250 L0 270 Z" />
      </g>
      <g className="settle" style={{ '--d': '60ms' } as React.CSSProperties}>
        <path filter="url(#torn)" fill={C.beige} d="M0 262 L124 222 L262 210 L300 330 L186 424 L0 446 Z" />
        <path filter="url(#torn)" fill={C.kraft} d="M0 520 L164 482 L334 520 L366 620 H0 Z" />
      </g>
      <g className="settle" style={{ '--d': '90ms' } as React.CSSProperties}>
        <path filter="url(#torn)" fill="#E4DCCB" d="M860 0 H1200 V196 L1010 176 L900 96 Z" />
        <path filter="url(#tornEdge)" fill="#F6F1E7" d="M896 258 L1062 204 L1200 218 V478 L1078 508 L924 438 Z" />
        <path filter="url(#torn)" fill={C.sage} d="M904 254 L1060 210 L1200 222 V470 L1080 500 L932 430 Z" />
        <path filter="url(#torn)" fill={C.forest} d="M1004 430 L1110 384 L1200 374 V620 H1060 L1030 548 Z" />
      </g>

      {/* the contract-page character */}
      <g className="settle character" style={{ '--d': '160ms' } as React.CSSProperties}>
        <path filter="url(#tornEdge)" fill="#F6F1E7" d="M318 128 Q 330 56 420 50 L 766 38 L 852 118 Q 892 170 882 262 L 892 640 L 288 640 Q 272 420 288 300 Q 296 186 318 128 Z" />
        <path filter="url(#torn)" fill={C.denim} d="M330 126 Q 342 62 424 58 L 760 46 L 842 122 Q 880 172 870 262 L 880 640 L 300 640 Q 286 420 300 302 Q 306 186 330 126 Z" />
        <path filter="url(#torn)" fill={C.denimLight} d="M352 96 L 566 74 L 606 182 L 452 246 L 340 214 Z" />
        <path filter="url(#torn)" fill={C.denimDark} d="M612 436 L 880 400 L 880 640 L 596 640 Z" />
        {/* dog-ear */}
        <path filter="url(#torn)" fill="#A9C1DE" d="M760 46 L 842 122 L 768 128 Z" />
        {/* eyes */}
        {[{ cx: 520, cy: 232, r: 66, p: 28 }, { cx: 704, cy: 222, r: 60, p: 26 }].map((eye, i) => (
          <g key={i}>
            <circle cx={eye.cx} cy={eye.cy} r={eye.r} fill={C.cream} filter="url(#torn)" />
            <g ref={el => { pupils.current[i] = el; }} className="pupil">
              <circle cx={eye.cx + 6} cy={eye.cy + 10} r={eye.p} fill={C.ink} filter="url(#rough)" />
            </g>
          </g>
        ))}
        {/* smile */}
        <path filter="url(#rough)" fill={C.ink} d="M556 326 Q 616 412 676 320 Q 616 346 556 326 Z" />
        {/* clause strips, one marked with a highlighter */}
        <g filter="url(#torn)">
          <rect x="560" y="446" width="230" height="22" fill={C.cream} transform="rotate(-1.5 560 446)" />
          <rect x="520" y="486" width="300" height="22" fill={C.cream} transform="rotate(-1 520 486)" />
          <rect x="560" y="526" width="180" height="22" fill={C.cream} transform="rotate(-2 560 526)" />
        </g>
        <g filter="url(#rough)"><rect className="marker-sweep" x="592" y="482" width="214" height="28" fill={C.marker} opacity="0.9" transform="rotate(-1 592 482)" /></g>
        <text x="528" y="503" fontFamily="'Courier Prime', monospace" fontSize="16" fontWeight="700" fill={C.ink} transform="rotate(-1 528 503)">3.2</text>
      </g>

      {/* motion strokes */}
      <g className="settle" style={{ '--d': '260ms' } as React.CSSProperties} stroke={C.ink} strokeWidth="13" strokeLinecap="round" filter="url(#rough)">
        <line x1="866" y1="96" x2="902" y2="50" />
        <line x1="882" y1="150" x2="936" y2="122" />
        <line x1="890" y1="202" x2="944" y2="196" />
      </g>

      {/* masking tape */}
      <g fill="#E9DDBF" opacity="0.88" filter="url(#rough)">
        <rect x="372" y="430" width="70" height="22" transform="rotate(-18 372 430)" />
        <rect x="1100" y="196" width="80" height="24" transform="rotate(14 1100 196)" />
      </g>

      {/* vintage box */}
      <g className="settle box" style={{ '--d': '320ms' } as React.CSSProperties}>
        <g transform="translate(956 92) rotate(10 96 140)">
          <VintageBox id="hero-box" width={182} height={270} />
        </g>
      </g>

      {/* pixel reader on the kraft ledge, with coffee */}
      <g className="settle" style={{ '--d': '400ms' } as React.CSSProperties}>
        <path filter="url(#torn)" fill={C.kraft} d="M846 560 L 1200 532 V620 H836 Z" />
        <g className="reader-bob"><PixelGroup x={826} y={372} scale={6} /></g>
        <g shapeRendering="crispEdges" transform="translate(1104 506) scale(6)">
          <rect x="0" y="2" width="5" height="6" fill="#EDEDED" />
          <rect x="5" y="3" width="2" height="3" fill="#EDEDED" />
          <rect x="6" y="4" width="1" height="1" fill={C.kraft} />
          <rect x="0" y="7" width="5" height="1" fill="#BDBDBD" />
          <g className="steam" fill="#F7F4EE">
            <rect x="1" y="0" width="1" height="1" /><rect x="2" y="-1" width="1" height="1" /><rect x="1" y="-2" width="1" height="1" />
            <rect x="3" y="0" width="1" height="1" /><rect x="4" y="-1" width="1" height="1" /><rect x="3" y="-3" width="1" height="1" />
          </g>
        </g>
      </g>
    </svg>
  );
}
