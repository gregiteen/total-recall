/**
 * Tiny SVG sparkline for peer RTT history (ms).
 * Pure presentation — parent owns sample buffer.
 */
export function LatencySparkline({
  values,
  width = 96,
  height = 28,
  title,
}: {
  values: Array<number | null | undefined>;
  width?: number;
  height?: number;
  title?: string;
}) {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (nums.length < 2) {
    return (
      <span className="latency-sparkline latency-sparkline--empty" title={title || 'not enough samples'}>
        —
      </span>
    );
  }

  const max = Math.max(...nums, 1);
  const min = Math.min(...nums, 0);
  const span = Math.max(max - min, 1);
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const points = nums
    .map((v, i) => {
      const x = pad + (innerW * i) / (nums.length - 1);
      const y = pad + innerH * (1 - (v - min) / span);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = nums[nums.length - 1];

  return (
    <svg
      className="latency-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title || `latency trend, last ${last} ms`}
      data-testid="latency-sparkline"
    >
      {title ? <title>{title}</title> : null}
      <polyline
        fill="none"
        stroke="var(--accent-hover, #3b82f6)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
      <circle
        cx={pad + innerW}
        cy={pad + innerH * (1 - (last - min) / span)}
        r="2.2"
        fill="var(--accent-hover, #3b82f6)"
      />
    </svg>
  );
}
