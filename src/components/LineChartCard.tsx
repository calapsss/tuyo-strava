"use client";

interface LineChartCardProps {
  title: string;
  summary: string;
  color?: string;
  unit: string;
  values: Array<{ x: number; y: number }>;
}

function formatDistance(value: number): string {
  return value.toFixed(1);
}

export function LineChartCard({ title, summary, color = "#ff5b14", unit, values }: LineChartCardProps) {
  const width = 760;
  const height = 180;
  const paddingX = 34;
  const paddingY = 16;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  if (values.length < 2) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#ff5b14]">{title}</h3>
          <p className="text-xs text-slate-500">{summary}</p>
        </div>
        <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
          Generate preview to view chart
        </div>
      </div>
    );
  }

  const xMax = values[values.length - 1].x;
  const yMinRaw = Math.min(...values.map((point) => point.y));
  const yMaxRaw = Math.max(...values.map((point) => point.y));
  const yPadding = Math.max(1, (yMaxRaw - yMinRaw) * 0.12);
  const yMin = yMinRaw - yPadding;
  const yMax = yMaxRaw + yPadding;
  const yRange = Math.max(1e-5, yMax - yMin);

  const points = values
    .map((point) => {
      const x = paddingX + (point.x / Math.max(xMax, 1e-5)) * chartWidth;
      const y = paddingY + ((yMax - point.y) / yRange) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");

  const xTicks = 7;
  const yTicks = 4;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#ff5b14]">{title}</h3>
        <p className="text-xs text-slate-500">{summary}</p>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] w-full">
        {Array.from({ length: xTicks + 1 }).map((_, index) => {
          const x = paddingX + (index / xTicks) * chartWidth;
          return <line key={`x-${x}`} x1={x} x2={x} y1={paddingY} y2={height - paddingY} stroke="#eef2f7" />;
        })}
        {Array.from({ length: yTicks + 1 }).map((_, index) => {
          const y = paddingY + (index / yTicks) * chartHeight;
          return <line key={`y-${y}`} x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="#eef2f7" />;
        })}
        <polyline fill="none" stroke={color} strokeWidth="2.2" points={points} />

        <text x={paddingX - 6} y={paddingY + 4} textAnchor="end" fontSize="10" fill="#64748b">
          {yMax.toFixed(0)}
        </text>
        <text x={paddingX - 6} y={height - paddingY + 4} textAnchor="end" fontSize="10" fill="#64748b">
          {yMin.toFixed(0)}
        </text>
        <text x={width - paddingX} y={height - 2} textAnchor="end" fontSize="10" fill="#64748b">
          Distance (km)
        </text>
        <text x={paddingX} y={12} textAnchor="start" fontSize="10" fill="#64748b">
          {unit}
        </text>
      </svg>

      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
        <span>0</span>
        <span>{formatDistance(xMax)} km</span>
      </div>
    </div>
  );
}
