import type { TimelineBucket } from "@/lib/metrics";

export interface CompareSeries {
  id: string;
  name: string;
  color: string;
  buckets: TimelineBucket[];
}

interface PlotPoint {
  month: string;
  churn: number;
  pct: number;
  commits: number;
  added: number;
  removed: number;
}

const PLOT_LEFT = 44;
const STEP = 36;
const PLOT_TOP = 12;
const PLOT_HEIGHT = 110;
const LABEL_Y = PLOT_TOP + PLOT_HEIGHT + 24;

/**
 * Multi-repo monthly churn as an SVG line chart. Repositories have wildly
 * different churn magnitudes, so each series is drawn relative to its own
 * peak month (0–100%) — the absolute numbers live in the comparison table
 * and the per-repo bar charts.
 */
export function CompareTimelineChart({ series }: { series: CompareSeries[] }) {
  const shown = series.map((s) => ({ ...s, buckets: s.buckets.slice(-24) }));
  const months = [
    ...new Set(shown.flatMap((s) => s.buckets.map((b) => b.month))),
  ].sort();

  if (months.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No commits in the selected repositories.
      </p>
    );
  }

  const width = PLOT_LEFT + months.length * STEP;
  const height = LABEL_Y + 4;
  const x = (i: number) => PLOT_LEFT + i * STEP + STEP / 2;
  const y = (pct: number) => PLOT_TOP + PLOT_HEIGHT * (1 - pct);

  const plotted = shown.map((s) => {
    const byMonth = new Map(s.buckets.map((b) => [b.month, b]));
    const peak = Math.max(1, ...s.buckets.map((b) => b.added + b.removed));
    const points: (PlotPoint | null)[] = months.map((month) => {
      const bucket = byMonth.get(month);
      if (!bucket) return null;
      const churn = bucket.added + bucket.removed;
      return {
        month,
        churn,
        pct: churn / peak,
        commits: bucket.commits,
        added: bucket.added,
        removed: bucket.removed,
      };
    });
    // Split into continuous runs so gaps (months a repo has no data for)
    // don't draw phantom lines across them.
    const segments: PlotPoint[][] = [];
    let current: PlotPoint[] = [];
    for (const point of points) {
      if (point) {
        current.push(point);
      } else if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    }
    if (current.length > 0) segments.push(current);
    return { ...s, peak, points, segments };
  });

  const ticks = months.filter(
    (_, i) => i % 6 === 0 || i === months.length - 1,
  );

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Relative monthly churn per repository"
        className="max-w-none"
      >
        {[0, 0.5, 1].map((pct) => (
          <g key={pct}>
            <line
              x1={PLOT_LEFT}
              x2={width}
              y1={y(pct)}
              y2={y(pct)}
              className="stroke-zinc-200 dark:stroke-zinc-700"
              strokeDasharray={pct === 0 ? undefined : "3 4"}
            />
            <text
              x={PLOT_LEFT - 6}
              y={y(pct) + 3}
              textAnchor="end"
              fontSize="9"
              className="fill-zinc-400 dark:fill-zinc-500"
            >
              {pct * 100}%
            </text>
          </g>
        ))}
        {ticks.map((month) => (
          <text
            key={month}
            x={x(months.indexOf(month))}
            y={LABEL_Y}
            textAnchor="middle"
            fontSize="9"
            className="fill-zinc-400 dark:fill-zinc-500"
          >
            {month}
          </text>
        ))}
        {plotted.map((s) => (
          <g key={s.id}>
            {s.segments.map((segment, index) =>
              segment.length > 1 ? (
                <polyline
                  key={index}
                  points={segment
                    .map(
                      (p) =>
                        `${x(months.indexOf(p.month))},${y(p.pct)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null,
            )}
            {s.points.map((point, index) =>
              point ? (
                <circle
                  key={index}
                  cx={x(index)}
                  cy={y(point.pct)}
                  r="3"
                  fill={s.color}
                >
                  <title>
                    {`${s.name} — ${point.month}: λ ${point.churn.toLocaleString("en-US")} ` +
                      `(+${point.added.toLocaleString("en-US")} / −${point.removed.toLocaleString("en-US")}), ` +
                      `${Math.round(point.pct * 100)}% of its peak month, ` +
                      `${point.commits.toLocaleString("en-US")} commits`}
                  </title>
                </circle>
              ) : null,
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
