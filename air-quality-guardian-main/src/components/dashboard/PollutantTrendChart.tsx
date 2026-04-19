import { useEffect, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fetchHourlyTrend } from "@/lib/api";
import { hourlyTrend as fallback } from "@/lib/dashboard-data";

export const PollutantTrendChart = () => {
  const [data, setData] = useState(fallback);

  useEffect(() => {
    let alive = true;
    fetchHourlyTrend().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Pollutant Trend — last 24h</h2>
          <p className="text-xs text-muted-foreground">Hourly average across station network</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Legend color="hsl(var(--primary))" label="PM2.5" />
          <Legend color="hsl(var(--status-unhealthy))" label="PM10" />
          <Legend color="hsl(var(--status-moderate))" label="NO₂" />
        </div>
      </header>

      <div className="h-56 sm:h-64 w-full -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={32}
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
            />
            <Line type="monotone" dataKey="pm25" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="pm10" stroke="hsl(var(--status-unhealthy))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="no2" stroke="hsl(var(--status-moderate))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
    {label}
  </span>
);
