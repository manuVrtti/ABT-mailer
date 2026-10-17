/**
 * Daily email activity: bars for emails sent, lines for opens and clicks on
 * the same scale (they can never exceed sends). Plain SVG, no client JS —
 * hovering a day shows its numbers via the native tooltip.
 */
export function ActivityChart({
  labels,
  sent,
  opened,
  clicked,
  height = 240,
  legend = ["Sent", "Opened", "Clicked"],
}: {
  labels: string[];
  sent: number[];
  opened: number[];
  /** Optional second line; pass [] to hide it. */
  clicked: number[];
  height?: number;
  /** Names for the bars, first line and second line. */
  legend?: [string, string, string];
}) {
  const width = 900;
  const padL = 44;
  const padR = 8;
  const padT = 12;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const n = labels.length;
  const max = niceMax(Math.max(1, ...sent, ...opened, ...clicked));
  const slot = innerW / Math.max(1, n);
  const barW = Math.max(2, Math.min(18, slot * 0.6));
  const x = (i: number) => padL + slot * i + slot / 2;
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const line = (data: number[]) => data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const labelEvery = Math.ceil(n / 8);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label="Daily email activity">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground" fontSize="11">
              {compact(t)}
            </text>
          </g>
        ))}
        {sent.map((v, i) => (
          <g key={i}>
            <title>{`${labels[i]}: ${v.toLocaleString()} ${legend[0].toLowerCase()} · ${(opened[i] ?? 0).toLocaleString()} ${legend[1].toLowerCase()}${clicked.length ? ` · ${(clicked[i] ?? 0).toLocaleString()} ${legend[2].toLowerCase()}` : ""}`}</title>
            {/* Full-height hover target */}
            <rect x={x(i) - slot / 2} y={padT} width={slot} height={innerH} className="fill-transparent hover:fill-muted/60" />
            <rect
              x={x(i) - barW / 2}
              y={y(v)}
              width={barW}
              height={Math.max(0, padT + innerH - y(v))}
              rx={2}
              className="pointer-events-none fill-brand-200 dark:fill-brand-900"
            />
          </g>
        ))}
        <path d={line(opened)} fill="none" className="pointer-events-none stroke-brand-600 dark:stroke-brand-400" strokeWidth={2} strokeLinejoin="round" />
        {clicked.length > 0 && (
          <path d={line(clicked)} fill="none" className="pointer-events-none stroke-sky-500" strokeWidth={2} strokeLinejoin="round" />
        )}
        {labels.map((l, i) =>
          i % labelEvery === 0 || (i === n - 1 && (n - 1) % labelEvery >= labelEvery / 2) ? (
            <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="fill-muted-foreground" fontSize="11">
              {l}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <Legend swatch="h-2.5 w-2.5 rounded-sm bg-brand-200 dark:bg-brand-900" label={legend[0]} />
        <Legend swatch="h-0.5 w-3 rounded bg-brand-600 dark:bg-brand-400" label={legend[1]} />
        {clicked.length > 0 && <Legend swatch="h-0.5 w-3 rounded bg-sky-500" label={legend[2]} />}
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={swatch} />
      {label}
    </span>
  );
}

function niceMax(v: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  // Fine steps so the tallest bar uses most of the height (11.4k → 12k, not 20k).
  const nice = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => f <= s) ?? 10;
  return nice * exp;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return String(n);
}
