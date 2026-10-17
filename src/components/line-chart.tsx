/**
 * Tiny multi-series line chart. Same "no dependencies, plain SVG" trick as
 * the sparkline, sized up for main-content usage. Renders a soft grid, axis
 * labels, and one line per series with a matching area gradient.
 */
export interface LineSeries {
  label: string;
  color: string; // Tailwind color CSS var or hex
  data: number[];
}

export function LineChart({
  series,
  width = 900,
  height = 240,
  xLabels,
}: {
  series: LineSeries[];
  width?: number;
  height?: number;
  /** Optional labels along the x-axis (must be same length as any series). */
  xLabels?: string[];
}) {
  const padX = 44;
  const padY = 22;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const allValues = series.flatMap((s) => s.data);
  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);
  const range = Math.max(1, max - min);
  const points = series.length > 0 ? series[0]!.data.length : 0;
  const stepX = points > 1 ? innerW / (points - 1) : innerW;

  const gridSteps = 4;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full">
        {/* Horizontal grid lines */}
        {Array.from({ length: gridSteps + 1 }).map((_, i) => {
          const y = padY + (innerH / gridSteps) * i;
          const val = max - (range / gridSteps) * i;
          return (
            <g key={i}>
              <line x1={padX} y1={y} x2={width - padX} y2={y} className="stroke-border" strokeDasharray={i === gridSteps ? undefined : "3 4"} />
              <text x={padX - 8} y={y} dy="0.32em" textAnchor="end" className="fill-muted-foreground" fontSize="11">
                {compact(Math.round(val))}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {xLabels && (
          <>
            {xLabels.map((label, i) => {
              if (i % Math.max(1, Math.ceil(xLabels.length / 6)) !== 0 && i !== xLabels.length - 1) return null;
              const x = padX + i * stepX;
              return (
                <text
                  key={i}
                  x={x}
                  y={height - padY + 16}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize="11"
                >
                  {label}
                </text>
              );
            })}
          </>
        )}

        {/* Each series */}
        {series.map((s, si) => {
          const gradId = `grad-${si}`;
          const pts = s.data.map((v, i) => {
            const x = padX + i * stepX;
            const y = padY + innerH - ((v - min) / range) * innerH;
            return [x, y] as const;
          });
          const linePath = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
          const areaPath = `${linePath} L${padX + innerW},${padY + innerH} L${padX},${padY + innerH} Z`;

          return (
            <g key={s.label}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={si === 0 ? 0.14 : 0} />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill={`url(#${gradId})`} />
              <path d={linePath} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
        {series.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
