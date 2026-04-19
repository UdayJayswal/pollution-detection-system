import { useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { AppNav } from "@/components/dashboard/AppNav";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { PollutantCard } from "@/components/dashboard/PollutantCard";
import { SourceInsightPanel } from "@/components/dashboard/SourceInsightPanel";
import { WindDirection } from "@/components/dashboard/WindDirection";
import { PollutantTrendChart } from "@/components/dashboard/PollutantTrendChart";
import { AqiGraph } from "@/components/dashboard/AqiGraph";
import { fetchPollutants, fetchWind, fetchIncidents, fetchDatasetLatest, type WindReading } from "@/lib/api";
import type { PollutantReading } from "@/lib/dashboard-data";
import type { Incident } from "@/lib/dataset";

const Index = () => {
  const [pollutants, setPollutants] = useState<PollutantReading[]>([]);
  const [wind, setWind] = useState<WindReading>({ degrees: 315, cardinal: "NW", speed: 12 });
  const [topIncident, setTopIncident] = useState<Incident | null>(null);
  const [updatedAt, setUpdatedAt] = useState("loading…");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [p, w, recent, latest] = await Promise.all([
        fetchPollutants(),
        fetchWind(),
        fetchIncidents(72),
        fetchDatasetLatest(),
      ]);
      if (!alive) return;
      setPollutants(p);
      setWind(w);
      setTopIncident(recent[0] ?? null);
      setUpdatedAt(
        latest
          ? latest.toLocaleString(undefined, {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—",
      );
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const alertTitle = topIncident
    ? `${topIncident.severity} severity event — ${topIncident.zone}`
    : "Air Quality nominal";
  const alertMessage = topIncident
    ? `${topIncident.pollutants.join(", ")} exceeded regulatory thresholds for ${topIncident.durationHours}h. Probable cause: ${topIncident.category}. Wind ${topIncident.wind} → ${topIncident.zone}.`
    : "No exceedance events in the last 72 hours at Maninagar station.";

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader station="Maninagar, Ahmedabad — GPCB" updatedAt={updatedAt} showSpikeBell />

      <main className="container py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6">
        <h1 className="sr-only">Environmental Monitoring Dashboard</h1>

        <AppNav />

        {topIncident && (
          <AlertBanner title={alertTitle} message={alertMessage} />
        )}

        <section aria-labelledby="pollutants-heading" className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 id="pollutants-heading" className="text-sm font-semibold text-foreground">
              Live Pollutant Readings
            </h2>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Source · CPCB 15-min averages
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
            {pollutants.map((p) => (
              <PollutantCard key={p.key} reading={p} />
            ))}
          </div>
        </section>

        {/* Centerpiece: realtime AQI graph */}
        <AqiGraph />

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2">
            <PollutantTrendChart />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 sm:gap-6">
            <WindDirection degrees={wind.degrees} cardinal={wind.cardinal} speed={wind.speed} />
          </div>
        </section>

        <section>
          <SourceInsightPanel />
        </section>

        <footer className="pt-2 pb-6 text-center text-xs text-muted-foreground">
          Vayu-Nirantar · Maninagar CAAQMS · Powered by CPCB dataset
        </footer>
      </main>
    </div>
  );
};

export default Index;
