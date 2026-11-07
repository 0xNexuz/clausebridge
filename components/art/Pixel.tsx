// Renders a pixel map as crisp SVG rectangles, merging runs of the same colour into one rect.
type Art = { colors: Record<string, string>; rows: string[] };

export function pixelRects(art: Art, only?: (key: string) => boolean) {
  const rects: { x: number; y: number; w: number; key: string }[] = [];
  art.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      let w = 1;
      while (x + w < row.length && row[x + w] === key) w++;
      if (key !== '.' && (!only || only(key))) rects.push({ x, y, w, key });
      x += w;
    }
  });
  return rects;
}

export default function Pixel({ art, scale = 6, className, title, groups }: {
  art: Art; scale?: number; className?: string; title?: string;
  /** Colour keys drawn in their own <g> with a class, so they can be animated (for example steam). */
  groups?: Record<string, string>;
}) {
  const width = art.rows[0].length;
  const height = art.rows.length;
  const grouped = new Set(Object.keys(groups ?? {}));
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} width={width * scale} height={height * scale}
      shapeRendering="crispEdges" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {pixelRects(art, key => !grouped.has(key)).map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={art.colors[r.key]} />)}
      {Object.entries(groups ?? {}).map(([key, cls]) => (
        <g key={key} className={cls}>
          {pixelRects(art, k => k === key).map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={art.colors[r.key]} />)}
        </g>
      ))}
    </svg>
  );
}
