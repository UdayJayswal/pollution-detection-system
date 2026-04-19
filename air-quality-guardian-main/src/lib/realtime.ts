/**
 * Realtime data adapter.
 *
 * Today the dashboard reads from the bundled CPCB xlsx — `subscribeRealtime`
 * polls the dataset every 15s, advancing through the rows so the AQI graph
 * "moves" like a live feed.
 *
 * Tomorrow, swap the body of `connectRealtimeDB()` to attach a Firebase /
 * Supabase Realtime / MQTT listener. As long as you push `RealtimePoint`
 * objects into the returned subscription, the rest of the UI keeps working.
 */
import { computeAQI } from "./aqi";
import { loadDataset, type DataRow, type Pollutant } from "./dataset";
import { USE_BACKEND } from "./api";

export interface RealtimePoint {
  ts: number; // epoch ms
  time: string; // HH:MM display
  aqi: number;
  dominant: Pollutant | null;
  values: Partial<Record<Pollutant, number>>;
}

export interface SpikeAlert {
  id: string;
  ts: number;
  pollutant: Pollutant;
  value: number;
  aqi: number;
  zone: string;
  band: string;
}

export interface FaultAlert {
  id: string;
  ts: number;
  pollutant: Pollutant;
  value: number;
  streak: number;
  zone: string;
  status: "PENDING" | "DISPATCHED";
}

type Listener = (pt: RealtimePoint) => void;
type SpikeListener = (s: SpikeAlert) => void;
type FaultListener = (f: FaultAlert) => void;

const fmt = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

type BackendRealtimeSnapshot = {
  points: RealtimePoint[];
  latestSpike: SpikeAlert | null;
};

async function fetchBackendSnapshot(): Promise<BackendRealtimeSnapshot> {
  const res = await fetch(`${API_BASE_URL}/api/dashboard/realtime?limit=120`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<BackendRealtimeSnapshot>;
}

class RealtimeStore {
  private points: RealtimePoint[] = [];
  private listeners = new Set<Listener>();
  private spikeListeners = new Set<SpikeListener>();
  private faultListeners = new Set<FaultListener>();
  private latestSpike: SpikeAlert | null = null;
  private latestFault: FaultAlert | null = null;
  private cursor = 0;
  private rows: DataRow[] = [];
  private timer: number | null = null;
  private connected = false;
  private connectionMode: "static-poll" | "realtime-db" = "static-poll";
  private lastValues: Partial<Record<Pollutant, number | undefined>> = {};
  private streaks: Partial<Record<Pollutant, number>> = {};
  private faultArmed: Partial<Record<Pollutant, boolean>> = {};

  async start() {
    if (this.connected) return;
    this.connected = true;
    if (USE_BACKEND) {
      await this.refreshBackend();
      this.timer = window.setInterval(() => {
        void this.refreshBackend();
      }, 15_000);
      return;
    }
    const { rows } = (await loadDataset())!;
    this.rows = rows;
    // Seed with last 60 rows (~15h of 15-min data) so chart isn't empty
    const seed = rows.slice(-60);
    this.points = seed.map((r) => this.toPoint(r));
    this.cursor = rows.length;
    this.tick(); // emit one immediately
    this.timer = window.setInterval(() => this.tick(), 15_000);
  }

  private async refreshBackend() {
    const snapshot = await fetchBackendSnapshot();
    this.points = snapshot.points;
    this.latestSpike = snapshot.latestSpike;
    if (snapshot.latestSpike) {
      this.spikeListeners.forEach((l) => l(snapshot.latestSpike));
    }
    this.listeners.forEach((l) => {
      const pt = snapshot.points[snapshot.points.length - 1];
      if (pt) l(pt);
    });
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.connected = false;
  }

  private toPoint(r: DataRow): RealtimePoint {
    const { aqi, dominant } = computeAQI(r.values);
    return { ts: r.to.getTime(), time: fmt(r.to), aqi, dominant, values: r.values };
  }

  private tick() {
    if (!this.rows.length) return;
    // Cycle through dataset to simulate a continuous live feed
    const idx = this.cursor % this.rows.length;
    const row = this.rows[idx];
    // Stamp with "now" to feel realtime, but values come from dataset row
    const stamped: DataRow = { from: new Date(), to: new Date(), values: row.values };
    const pt = this.toPoint(stamped);
    this.points = [...this.points.slice(-120), pt];
    this.cursor++;
    this.listeners.forEach((l) => l(pt));

    // Spike detection — AQI jump > 80 OR AQI > 200
    const prev = this.points[this.points.length - 2];
    const jumped = prev && pt.aqi - prev.aqi > 80;
    if ((jumped || pt.aqi > 200) && pt.dominant) {
      const v = pt.values[pt.dominant] ?? 0;
      const spike: SpikeAlert = {
        id: `SPK-${pt.ts}`,
        ts: pt.ts,
        pollutant: pt.dominant,
        value: Math.round(v * 100) / 100,
        aqi: pt.aqi,
        zone: "Maninagar, Ahmedabad",
        band:
          pt.aqi > 400 ? "Severe" : pt.aqi > 300 ? "Very Poor" : pt.aqi > 200 ? "Poor" : "Moderate",
      };
      this.latestSpike = spike;
      this.spikeListeners.forEach((l) => l(spike));
    }

    // Fault detection — same exact reading 3 times in a row for a pollutant.
    for (const pollutant of Object.keys(pt.values) as Pollutant[]) {
      const value = pt.values[pollutant];
      if (value === undefined) continue;

      const prev = this.lastValues[pollutant];
      const streak = prev === value ? (this.streaks[pollutant] ?? 1) + 1 : 1;
      this.lastValues[pollutant] = value;
      this.streaks[pollutant] = streak;

      if (streak < 3) {
        this.faultArmed[pollutant] = true;
        continue;
      }

      if (streak === 3 && this.faultArmed[pollutant] !== false) {
        const fault: FaultAlert = {
          id: `FLT-${pollutant}-${pt.ts}`,
          ts: pt.ts,
          pollutant,
          value: Math.round(value * 100) / 100,
          streak,
          zone: "Maninagar, Ahmedabad",
          status: "PENDING",
        };
        this.latestFault = fault;
        this.faultArmed[pollutant] = false;
        this.faultListeners.forEach((l) => l(fault));
      }
    }
  }

  getPoints() {
    return this.points;
  }

  getAverage() {
    if (!this.points.length) return 0;
    return Math.round(this.points.reduce((s, p) => s + p.aqi, 0) / this.points.length);
  }

  getLatestSpike() {
    return this.latestSpike;
  }

  getLatestFault() {
    return this.latestFault;
  }

  getMode() {
    return this.connectionMode;
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  subscribeSpike(l: SpikeListener) {
    this.spikeListeners.add(l);
    return () => this.spikeListeners.delete(l);
  }

  subscribeFault(l: FaultListener) {
    this.faultListeners.add(l);
    return () => this.faultListeners.delete(l);
  }
}

export const realtime = new RealtimeStore();

/**
 * PLACEHOLDER: replace with Firebase/Supabase realtime listener.
 * Keep the same `RealtimePoint` shape and feed `realtime` via the same
 * push pipeline used in `tick()` — no UI code needs to change.
 */
export async function connectRealtimeDB(): Promise<void> {
  await realtime.start();
}
