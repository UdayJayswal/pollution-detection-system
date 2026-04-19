import { useEffect, useState } from "react";
import { Factory, Sparkles } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { fetchSourceInsight, type SourceInsight } from "@/lib/api";
import { sourceContribution as fallback } from "@/lib/dashboard-data";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--status-moderate))",
  "hsl(var(--status-unhealthy))",
  "hsl(var(--muted-foreground))",
];

const initial: SourceInsight = {
  contribution: fallback,
  dominant: fallback[0]?.name ?? "Industrial",
  confidence: 87,
  reasoning:
    "Elevated PM2.5 and SO₂ correlate with downwind activity from the Sector 7 industrial belt. Stable NW wind supports industrial-source attribution.",
};

export const SourceInsightPanel = () => {
  const [insight, setInsight] = useState<SourceInsight>(initial);

  useEffect(() => {
    let alive = true;
    fetchSourceInsight().then((d) => alive && setInsight(d));
    return () => {
      alive = false;
    };
  }, []);

  const dominant = insight.contribution.find((c) => c.name === insight.dominant) ?? insight.contribution[0];

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-card h-full">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-semibold">Source Insight</h2>
        </div>
        <span className="text-[11px] text-muted-foreground">AI · Hourly</span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-center">
        <div className="relative mx-auto h-28 w-28">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={insight.contribution}
                dataKey="value"
                innerRadius={36}
                outerRadius={54}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {insight.contribution.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold tabular-nums">{dominant?.value ?? 0}%</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">share</span>
          </div>
        </div>

        <div className="space-y-3 min-w-0">
          <div>
            <p className="text-xs text-muted-foreground">Dominant source</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Factory className="h-4 w-4 text-primary" />
              <p className="text-base font-semibold">{insight.dominant}</p>
            </div>
          </div>

        </div>
      </div>

      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
        {insight.reasoning}
      </p>

      <ul className="grid grid-cols-2 gap-2">
        {insight.contribution.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-muted-foreground">{s.name}</span>
            <span className="ml-auto tabular-nums font-medium">{s.value}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
