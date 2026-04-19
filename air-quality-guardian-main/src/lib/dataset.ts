/**
 * Dataset loader — mirrors app.py logic exactly.
 *
 * Loads the bundled CPCB Maninagar (Ahmedabad) xlsx, parses 15-min
 * pollutant rows, applies thresholds, merges contiguous exceedances
 * into incidents, classifies source category & severity.
 *
 * Pure client-side — no backend required for the demo.
 */
import * as XLSX from "xlsx";
import datasetUrl from "@/assets/dataset.xlsx?url";

export const POLLUTANTS = ["PM2.5", "PM10", "NO", "NO2", "NOx", "SO2", "CO"] as const;
export type Pollutant = (typeof POLLUTANTS)[number];

export const THRESHOLDS: Record<Pollutant, number> = {
  "PM2.5": 60,
  PM10: 150,
  NO: 80,
  NO2: 80,
  NOx: 200,
  SO2: 100,
  CO: 4,
};

export const POLLUTANT_UNITS: Record<Pollutant, string> = {
  "PM2.5": "µg/m³",
  PM10: "µg/m³",
  NO: "ppb",
  NO2: "ppb",
  NOx: "ppb",
  SO2: "ppb",
  CO: "mg/m³",
};

export const WIND_MAP: Record<string, string> = {
  N: "North Zone",
  S: "South Zone",
  E: "East Zone",
  W: "West Zone",
  NE: "Vatva Industrial Area",
  NW: "Sabarmati Area",
  SE: "Narol Area",
  SW: "Odhav Area",
};
const WIND_KEYS = Object.keys(WIND_MAP);

export interface DataRow {
  from: Date;
  to: Date;
  values: Partial<Record<Pollutant, number>>;
}

export interface Incident {
  id: string;
  from: Date;
  to: Date;
  durationHours: number;
  pollutants: Pollutant[];
  wind: string;
  windSpeed: number; // km/h
  zone: string;
  category: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  peakValue: number;
  peakPollutant: Pollutant;
}

// -------- date parsing: "DD-MM-YYYY HH:MM" (CPCB format) --------
// Build dates as LOCAL time (matches how the CPCB site displays them, IST).
// Uses Date.UTC + manual offset would shift the displayed hour — we want
// the wall-clock label to match the source file exactly.
function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial date — interpret as local wall-clock
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(d.y, d.m - 1, d.d, d.H ?? 0, d.M ?? 0, Math.floor(d.S ?? 0));
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  // Accept "DD-MM-YYYY HH:MM" or "DD-MM-YYYY[T]HH:MM[:SS][Z]" with optional trailing tz
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy, h, mi, ss] = m;
  const day = +dd, month = +mm, year = +yyyy;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day, +h, +mi, ss ? +ss : 0);
}

function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "" || v === "None") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

// -------- classification (mirrors latest app.py classify_source — 3 categories) --------
export function classifySource(exceeded: Pollutant[]): string {
  const has = (p: Pollutant) => exceeded.includes(p);
  let agri = 0;
  let ind = 0;
  if (has("PM2.5")) agri += 2;
  if (has("PM10")) agri += 2;
  if (has("CO")) agri += 1;
  if (has("NO2")) ind += 2;
  if (has("SO2")) ind += 2;
  if (has("NOx")) ind += 2;
  if (has("CO")) ind += 1;
  if (agri > ind) return "Agricultural / Biomass Burning";
  if (ind > agri) return "Industrial Emission";
  return "Mixed Urban Pollution";
}

export function getSeverity(exceeded: Pollutant[]): "LOW" | "MEDIUM" | "HIGH" {
  const c = exceeded.length;
  if (c >= 4) return "HIGH";
  if (c >= 2) return "MEDIUM";
  return "LOW";
}

// Stable per-incident wind based on incident timestamp (deterministic — not random)
function stableWind(seed: number): string {
  return WIND_KEYS[Math.abs(seed) % WIND_KEYS.length];
}

const WIND_SPEEDS = [6, 8, 10, 12, 14, 16, 18, 20, 22];
function stableWindSpeed(seed: number): number {
  return WIND_SPEEDS[Math.abs(seed) % WIND_SPEEDS.length];
}

// -------- main loader --------
let cached: { rows: DataRow[]; incidents: Incident[] } | null = null;
let loadingPromise: Promise<typeof cached> | null = null;

export async function loadDataset() {
  if (cached) return cached;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const buf = await fetch(datasetUrl).then((r) => r.arrayBuffer());
    const wb = XLSX.read(buf, { type: "array", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
    // Header row at index 16 (row 17), data from index 17
    const headerIdx = aoa.findIndex(
      (r) => Array.isArray(r) && r[0] === "From Date" && r[1] === "To Date",
    );
    const startIdx = headerIdx >= 0 ? headerIdx + 1 : 17;

    const rows: DataRow[] = [];
    for (let i = startIdx; i < aoa.length; i++) {
      const r = aoa[i];
      if (!r) continue;
      const from = parseDate(r[0]);
      const to = parseDate(r[1]);
      if (!from || !to) continue;
      rows.push({
        from,
        to,
        values: {
          "PM2.5": toNum(r[2]),
          PM10: toNum(r[3]),
          NO: toNum(r[4]),
          NO2: toNum(r[5]),
          NOx: toNum(r[6]),
          SO2: toNum(r[7]),
          CO: toNum(r[8]),
        },
      });
    }

    // -------- incident detection (mirrors app.py) --------
    type Evt = { from: Date; to: Date; pollutants: Pollutant[]; peakValue: number; peakPollutant: Pollutant };
    const events: Evt[] = [];
    for (const row of rows) {
      const exceeded: Pollutant[] = [];
      let peakValue = 0;
      let peakPollutant: Pollutant = "PM2.5";
      for (const p of POLLUTANTS) {
        const v = row.values[p];
        if (v !== undefined && v > THRESHOLDS[p]) {
          exceeded.push(p);
          const ratio = v / THRESHOLDS[p];
          if (ratio > peakValue) {
            peakValue = ratio;
            peakPollutant = p;
          }
        }
      }
      if (exceeded.length) {
        events.push({ from: row.from, to: row.to, pollutants: exceeded, peakValue, peakPollutant });
      }
    }

    const incidents: Incident[] = [];
    if (events.length) {
      let cur = { ...events[0], pollutants: [...events[0].pollutants] };
      for (let i = 1; i < events.length; i++) {
        const nxt = events[i];
        if (nxt.from.getTime() === cur.to.getTime()) {
          cur.to = nxt.to;
          cur.pollutants = Array.from(new Set([...cur.pollutants, ...nxt.pollutants]));
          if (nxt.peakValue > cur.peakValue) {
            cur.peakValue = nxt.peakValue;
            cur.peakPollutant = nxt.peakPollutant;
          }
        } else {
          incidents.push(finalize(cur, incidents.length));
          cur = { ...nxt, pollutants: [...nxt.pollutants] };
        }
      }
      incidents.push(finalize(cur, incidents.length));
    }

    cached = { rows, incidents };
    return cached;
  })();
  return loadingPromise;
}

function finalize(
  e: { from: Date; to: Date; pollutants: Pollutant[]; peakValue: number; peakPollutant: Pollutant },
  idx: number,
): Incident {
  const seed = e.from.getTime() + idx;
  const wind = stableWind(seed);
  const windSpeed = stableWindSpeed(seed >> 3);
  return {
    id: `INC-${String(idx + 1).padStart(5, "0")}`,
    from: e.from,
    to: e.to,
    durationHours: Math.round(((e.to.getTime() - e.from.getTime()) / 36e5) * 100) / 100,
    pollutants: e.pollutants,
    wind,
    windSpeed,
    zone: WIND_MAP[wind],
    category: classifySource(e.pollutants),
    severity: getSeverity(e.pollutants),
    peakValue: e.peakValue,
    peakPollutant: e.peakPollutant,
  };
}

// -------- derived selectors --------
export async function getLatestReadings() {
  const { rows } = (await loadDataset())!;
  // Latest non-empty row per pollutant, plus previous-hour comparison
  const latest = rows[rows.length - 1];
  const prev = rows[rows.length - 5] ?? rows[0]; // ~1h earlier (15-min rows)
  return POLLUTANTS.map((p) => {
    const v = latest?.values[p] ?? 0;
    const pv = prev?.values[p] ?? v;
    const delta = pv ? ((v - pv) / pv) * 100 : 0;
    // Build sparkline from last 24 rows (~6h)
    const trend = rows.slice(-24).map((r) => r.values[p] ?? 0);
    return { pollutant: p, value: v, delta, trend, timestamp: latest?.to };
  });
}

export async function getHourlyTrend(hours = 24) {
  const { rows } = (await loadDataset())!;
  // Take last N hours (4 rows per hour)
  const slice = rows.slice(-hours * 4);
  // Aggregate per hour
  const buckets = new Map<string, { pm25: number[]; pm10: number[]; no2: number[] }>();
  for (const r of slice) {
    const key = `${String(r.from.getHours()).padStart(2, "0")}:00`;
    const b = buckets.get(key) ?? { pm25: [], pm10: [], no2: [] };
    if (r.values["PM2.5"] !== undefined) b.pm25.push(r.values["PM2.5"]);
    if (r.values["PM10"] !== undefined) b.pm10.push(r.values["PM10"]);
    if (r.values["NO2"] !== undefined) b.no2.push(r.values["NO2"]);
    buckets.set(key, b);
  }
  const avg = (a: number[]) => (a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10 : 0);
  return Array.from(buckets.entries()).map(([time, b]) => ({
    time,
    pm25: avg(b.pm25),
    pm10: avg(b.pm10),
    no2: avg(b.no2),
  }));
}

/** Latest timestamp present in the dataset — anchors all "recent" windows. */
export async function getDatasetLatest(): Promise<Date | null> {
  const { rows } = (await loadDataset())!;
  return rows.length ? rows[rows.length - 1].to : null;
}

export async function getDatasetRange(): Promise<{ start: Date; end: Date } | null> {
  const { rows } = (await loadDataset())!;
  if (!rows.length) return null;
  return { start: rows[0].from, end: rows[rows.length - 1].to };
}

export async function getRecentIncidents(hours = 24): Promise<Incident[]> {
  const { incidents, rows } = (await loadDataset())!;
  if (!rows.length) return [];
  // Anchor to the dataset's latest timestamp (not wall-clock), so that
  // "last 24h" returns the most recent 24h *of data* rather than nothing.
  const anchor = rows[rows.length - 1].to.getTime();
  const cutoff = anchor - hours * 3600_000;
  return incidents
    .filter((i) => i.to.getTime() >= cutoff && i.to.getTime() <= anchor)
    .reverse();
}

export async function getSourceBreakdown() {
  const { incidents } = (await loadDataset())!;
  const counts = new Map<string, number>();
  for (const i of incidents) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  const total = Array.from(counts.values()).reduce((s, v) => s + v, 0) || 1;
  const contribution = Array.from(counts.entries())
    .map(([name, n]) => ({ name, value: Math.round((n / total) * 100) }))
    .sort((a, b) => b.value - a.value);
  const dominant = contribution[0]?.name ?? "Mixed Urban Pollution";
  const zones = new Map<string, number>();
  for (const i of incidents) zones.set(i.zone, (zones.get(i.zone) ?? 0) + 1);
  const topZone =
    Array.from(zones.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unknown";
  return {
    contribution,
    dominant,
    topZone,
    totalIncidents: incidents.length,
    confidence: Math.min(99, 60 + Math.round((contribution[0]?.value ?? 0) * 0.4)),
  };
}

export async function getCurrentWind(): Promise<{ degrees: number; cardinal: string; speed: number }> {
  const recent = await getRecentIncidents(24);
  const top = recent[0];
  const cardinal = top?.wind ?? "NW";
  const speed = top?.windSpeed ?? 12;
  const map: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
  return { degrees: map[cardinal] ?? 315, cardinal, speed };
}
