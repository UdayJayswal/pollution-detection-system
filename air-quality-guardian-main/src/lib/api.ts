/**
 * Data API — backed by the bundled CPCB Maninagar xlsx dataset.
 * Mirrors the Python `app.py` logic in pure TypeScript so the
 * dashboard runs entirely client-side for the hackathon demo.
 */
import {
  getLatestReadings,
  getHourlyTrend,
  getRecentIncidents,
  getSourceBreakdown,
  getCurrentWind,
  getDatasetLatest,
  getDatasetRange,
  POLLUTANT_UNITS,
  THRESHOLDS,
  type Incident,
  type Pollutant,
} from "./dataset";
import {
  statusMeta,
  type AqiStatus,
  type PollutantReading,
} from "./dashboard-data";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
export const USE_BACKEND = !!API_BASE_URL;

export interface Spike {
  id: string;
  timestamp: string;
  pollutant: string;
  value: number;
  unit: string;
  threshold: number;
  zone: string;
  severity: "Moderate" | "High" | "Hazardous";
}

export interface WindReading {
  degrees: number;
  cardinal: string;
  speed: number;
}

export interface SourceInsight {
  contribution: { name: string; value: number }[];
  dominant: string;
  confidence: number;
  reasoning: string;
}

const POLLUTANT_LABEL: Record<Pollutant, string> = {
  "PM2.5": "PM2.5",
  PM10: "PM10",
  NO: "NO",
  NO2: "NO₂",
  NOx: "NOx",
  SO2: "SO₂",
  CO: "CO",
};

const POLLUTANT_KEY: Record<Pollutant, string> = {
  "PM2.5": "pm25",
  PM10: "pm10",
  NO: "no",
  NO2: "no2",
  NOx: "nox",
  SO2: "so2",
  CO: "co",
};

function statusFor(p: Pollutant, v: number): AqiStatus {
  const t = THRESHOLDS[p];
  if (v <= t * 0.5) return "good";
  if (v <= t) return "moderate";
  if (v <= t * 1.5) return "unhealthy";
  return "hazardous";
}

async function backendGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

function asDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function mapIncident(row: any): Incident {
  return {
    id: row.id,
    from: asDate(row.from) ?? new Date(),
    to: asDate(row.to) ?? new Date(),
    durationHours: row.durationHours ?? row.duration_hours ?? 0,
    pollutants: row.pollutants ?? [],
    wind: row.wind ?? "NW",
    windSpeed: row.windSpeed ?? row.wind_speed ?? 12,
    zone: row.zone ?? "Maninagar, Ahmedabad",
    category: row.category ?? "Mixed Urban Pollution",
    severity: row.severity ?? "LOW",
    peakValue: row.peakValue ?? row.peak_value ?? 0,
    peakPollutant: row.peakPollutant ?? row.peak_pollutant ?? "PM2.5",
  };
}

export async function fetchPollutants(): Promise<PollutantReading[]> {
  if (USE_BACKEND) return backendGet<PollutantReading[]>("/api/dashboard/pollutants");
  const latest = await getLatestReadings();
  // Show the 5 cards used by the UI: PM2.5, PM10, SO2, NO2, CO
  const display: Pollutant[] = ["PM2.5", "PM10", "SO2", "NO2", "CO"];
  return display.map((p) => {
    const r = latest.find((x) => x.pollutant === p)!;
    const value = Math.round((r?.value ?? 0) * 100) / 100;
    return {
      key: POLLUTANT_KEY[p],
      label: POLLUTANT_LABEL[p],
      unit: POLLUTANT_UNITS[p],
      value,
      status: statusFor(p, value),
      trend: r?.trend ?? [],
      delta: Math.round((r?.delta ?? 0) * 10) / 10,
    };
  });
}

export const fetchHourlyTrend = () => USE_BACKEND ? backendGet<{ time: string; pm25: number; pm10: number; no2: number }[]>("/api/dashboard/hourly-trend?hours=24") : getHourlyTrend(24);

export async function fetchSourceInsight(): Promise<SourceInsight> {
  if (USE_BACKEND) return backendGet<SourceInsight>("/api/dashboard/source-insight");
  const s = await getSourceBreakdown();
  return {
    contribution: s.contribution,
    dominant: s.dominant,
    confidence: s.confidence,
    reasoning: `Across ${s.totalIncidents} historical incidents at Maninagar, "${s.dominant}" is the most frequent attribution. The most affected zone is ${s.topZone}, derived from prevailing wind direction during exceedance windows.`,
  };
}

export const fetchWind = (): Promise<WindReading> => USE_BACKEND ? backendGet<WindReading>("/api/dashboard/wind") : getCurrentWind();

export async function fetchSpikes(hours = 24): Promise<Spike[]> {
  if (USE_BACKEND) return backendGet<Spike[]>(`/api/dashboard/spikes?hours=${hours}`);
  const incidents: Incident[] = await getRecentIncidents(hours);
  const out: Spike[] = [];
  for (const i of incidents) {
    const sev: Spike["severity"] =
      i.severity === "HIGH" ? "Hazardous" : i.severity === "MEDIUM" ? "High" : "Moderate";
    i.pollutants.forEach((p, idx) => {
      const isPeak = p === i.peakPollutant;
      const value = isPeak
        ? Math.round(i.peakValue * THRESHOLDS[i.peakPollutant] * 100) / 100
        : Math.round(THRESHOLDS[p] * 1.1 * 100) / 100;
      out.push({
        id: `${i.id}-${idx + 1}`,
        timestamp: i.from.toISOString(),
        pollutant: POLLUTANT_LABEL[p],
        value,
        unit: POLLUTANT_UNITS[p],
        threshold: THRESHOLDS[p],
        zone: i.zone,
        severity: sev,
      });
    });
  }
  return out;
}

/** Returns full incidents (richer than spikes) for PDF reporting. */
export const fetchIncidents = async (hours = 24) => {
  if (USE_BACKEND) {
    const rows = await backendGet<any[]>(`/api/dashboard/incidents?hours=${hours}`);
    return rows.map(mapIncident);
  }
  return getRecentIncidents(hours);
};

/** Latest timestamp in the bundled dataset — used as the "live" anchor. */
export const fetchDatasetLatest = () => USE_BACKEND ? backendGet<string | null>("/api/dashboard/dataset-latest").then((v) => (v ? new Date(v) : null)) : getDatasetLatest();
export const fetchDatasetRange = () => USE_BACKEND ? backendGet<{ start: string | null; end: string | null }>("/api/dashboard/dataset-range").then((v) => v.start && v.end ? { start: new Date(v.start), end: new Date(v.end) } : null) : getDatasetRange();

// Suppress unused warnings — kept for component compatibility
export type { PollutantReading };
export { statusMeta };
