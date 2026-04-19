import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { type PollutantReading, statusMeta } from "@/lib/dashboard-data";

interface PollutantCardProps {
  reading: PollutantReading;
}

export const PollutantCard = ({ reading }: PollutantCardProps) => {
  const meta = statusMeta[reading.status];
  const data = reading.trend.map((v, i) => ({ i, v }));
  const up = reading.delta >= 0;
  const gradId = `grad-${reading.key}`;
  // map status -> CSS variable for sparkline stroke
  const strokeVar = `hsl(var(--status-${reading.status}))`;

  return (
    <article className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-elevated">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-muted-foreground">{reading.label}</h3>
          <p className="text-[11px] text-muted-foreground/80">{reading.unit}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
            meta.bg,
            meta.text,
            meta.ring,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
          {meta.label}
        </span>
      </header>

      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums">
            {reading.value}
          </span>
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
            up ? "text-status-unhealthy" : "text-status-good",
          )}
        >
          {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(reading.delta).toFixed(1)}%
        </div>
      </div>

      <div className="h-12 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeVar} stopOpacity={0.35} />
                <stop offset="100%" stopColor={strokeVar} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={strokeVar}
              strokeWidth={1.75}
              fill={`url(#${gradId})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
};
