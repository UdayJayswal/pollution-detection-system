import { useEffect, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, Wifi } from "lucide-react";
import { connectRealtimeDB, realtime, type RealtimePoint } from "@/lib/realtime";
import { aqiBand } from "@/lib/aqi";
import { cn } from "@/lib/utils";

export const AqiGraph = () => {
  const [points, setPoints] = useState<RealtimePoint[]>([]);
  const [avg, setAvg] = useState(0);
  const [latest, setLatest] = useState<RealtimePoint | null>(null);

  useEffect(() => {
    let alive = true;
    const sync = () => {
      const p = realtime.getPoints();
      setPoints(p);
      setAvg(realtime.getAverage());
      setLatest(p[p.length - 1] ?? null);
    };
    connectRealtimeDB().then(() => alive && sync());
    const off = realtime.subscribe(() => alive && sync());
    return () => {
      alive = false;
      off();
    };
  }, []);

  const band = aqiBand(latest?.aqi ?? avg);
  const avgBand = aqiBand(avg);

  return (
    <section className="relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg ring-1", band.soft, band.ring)}>
            <Activity className={cn("h-5 w-5", band.tone)} />
          </div>
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              Realtime Air Quality Index
              <span className="inline-flex items-center gap-1 rounded-full bg-status-good-soft px-2 py-0.5 text-[10px] font-medium text-status-good ring-1 ring-status-good/20">
                <Wifi className="h-3 w-3" /> LIVE
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Updated every 15s · Maninagar CAAQMS · Ready for realtime DB
            </p>
          </div>
        </div>

        {/* Avg AQI badge — sits inside the chart card, prominent */}
        <div className={cn("rounded-lg px-3 py-2 text-right ring-1", avgBand.soft, avgBand.ring)}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Avg AQI
          </div>
          <div className={cn("text-2xl font-bold tabular-nums leading-none", avgBand.tone)}>
            {avg}
          </div>
          <div className={cn("text-[10px] font-medium", avgBand.tone)}>{avgBand.label}</div>
        </div>
      </header>

      {/* Big current AQI overlay inside the graph */}
      <div className="relative">
        <div className="absolute left-3 top-2 z-10 pointer-events-none">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current</div>
          <div className={cn("text-4xl sm:text-5xl font-extrabold tabular-nums leading-none", band.tone)}>
            {latest?.aqi ?? "—"}
          </div>
          <div className={cn("text-xs font-semibold mt-0.5", band.tone)}>
            {band.label}
            {latest?.dominant ? <span className="text-muted-foreground font-normal"> · {latest.dominant}</span> : null}
          </div>
        </div>

        <div className="h-64 sm:h-72 w-full -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="aqiFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                interval="preserveStartEnd"
                minTickGap={32}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={32}
                domain={[0, (dataMax: number) => Math.max(200, Math.ceil((dataMax + 50) / 50) * 50)]}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                  boxShadow: "var(--shadow-elevated)",
                }}
                labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                formatter={(v: number) => [v, "AQI"]}
              />
              <ReferenceLine
                y={avg}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                label={{ value: `avg ${avg}`, position: "right", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              />
              <ReferenceLine y={100} stroke="hsl(var(--status-moderate))" strokeOpacity={0.4} strokeDasharray="2 4" />
              <ReferenceLine y={200} stroke="hsl(var(--status-unhealthy))" strokeOpacity={0.4} strokeDasharray="2 4" />
              <ReferenceLine y={300} stroke="hsl(var(--status-hazardous))" strokeOpacity={0.4} strokeDasharray="2 4" />
              <Area
                type="monotone"
                dataKey="aqi"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                fill="url(#aqiFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground border-t border-border pt-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-good" /> 0–100</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-moderate" /> 101–200</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-unhealthy" /> 201–300</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-hazardous" /> 301+</span>
        </div>
        <span>{points.length} samples in window</span>
      </footer>
    </section>
  );
};
