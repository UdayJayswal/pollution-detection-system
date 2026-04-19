/**
 * Indian National AQI calculation (CPCB sub-index method).
 * Returns the worst sub-index across PM2.5, PM10, NO2, SO2, CO.
 * For CO, value is in mg/m³ (NOT ppb / ppm scaling).
 */
import type { Pollutant } from "./dataset";

type BP = { lo: number; hi: number; iLo: number; iHi: number };

const TABLES: Partial<Record<Pollutant, BP[]>> = {
  "PM2.5": [
    { lo: 0, hi: 30, iLo: 0, iHi: 50 },
    { lo: 31, hi: 60, iLo: 51, iHi: 100 },
    { lo: 61, hi: 90, iLo: 101, iHi: 200 },
    { lo: 91, hi: 120, iLo: 201, iHi: 300 },
    { lo: 121, hi: 250, iLo: 301, iHi: 400 },
    { lo: 251, hi: 500, iLo: 401, iHi: 500 },
  ],
  PM10: [
    { lo: 0, hi: 50, iLo: 0, iHi: 50 },
    { lo: 51, hi: 100, iLo: 51, iHi: 100 },
    { lo: 101, hi: 250, iLo: 101, iHi: 200 },
    { lo: 251, hi: 350, iLo: 201, iHi: 300 },
    { lo: 351, hi: 430, iLo: 301, iHi: 400 },
    { lo: 431, hi: 800, iLo: 401, iHi: 500 },
  ],
  NO2: [
    { lo: 0, hi: 40, iLo: 0, iHi: 50 },
    { lo: 41, hi: 80, iLo: 51, iHi: 100 },
    { lo: 81, hi: 180, iLo: 101, iHi: 200 },
    { lo: 181, hi: 280, iLo: 201, iHi: 300 },
    { lo: 281, hi: 400, iLo: 301, iHi: 400 },
    { lo: 401, hi: 800, iLo: 401, iHi: 500 },
  ],
  SO2: [
    { lo: 0, hi: 40, iLo: 0, iHi: 50 },
    { lo: 41, hi: 80, iLo: 51, iHi: 100 },
    { lo: 81, hi: 380, iLo: 101, iHi: 200 },
    { lo: 381, hi: 800, iLo: 201, iHi: 300 },
    { lo: 801, hi: 1600, iLo: 301, iHi: 400 },
    { lo: 1601, hi: 3200, iLo: 401, iHi: 500 },
  ],
  CO: [
    { lo: 0, hi: 1, iLo: 0, iHi: 50 },
    { lo: 1.1, hi: 2, iLo: 51, iHi: 100 },
    { lo: 2.1, hi: 10, iLo: 101, iHi: 200 },
    { lo: 10.1, hi: 17, iLo: 201, iHi: 300 },
    { lo: 17.1, hi: 34, iLo: 301, iHi: 400 },
    { lo: 34.1, hi: 60, iLo: 401, iHi: 500 },
  ],
};

export function subIndex(p: Pollutant, value: number): number | null {
  const t = TABLES[p];
  if (!t || !Number.isFinite(value)) return null;
  for (const bp of t) {
    if (value >= bp.lo && value <= bp.hi) {
      return Math.round(((bp.iHi - bp.iLo) / (bp.hi - bp.lo)) * (value - bp.lo) + bp.iLo);
    }
  }
  if (value > t[t.length - 1].hi) return 500;
  return null;
}

export function computeAQI(values: Partial<Record<Pollutant, number>>): {
  aqi: number;
  dominant: Pollutant | null;
} {
  let max = 0;
  let dom: Pollutant | null = null;
  for (const [p, v] of Object.entries(values) as [Pollutant, number | undefined][]) {
    if (v === undefined) continue;
    const s = subIndex(p, v);
    if (s !== null && s > max) {
      max = s;
      dom = p;
    }
  }
  return { aqi: max, dominant: dom };
}

export type AqiBand = "Good" | "Satisfactory" | "Moderate" | "Poor" | "Very Poor" | "Severe";

export function aqiBand(aqi: number): { label: AqiBand; tone: string; ring: string; soft: string } {
  if (aqi <= 50) return { label: "Good", tone: "text-status-good", ring: "ring-status-good/30", soft: "bg-status-good-soft" };
  if (aqi <= 100) return { label: "Satisfactory", tone: "text-status-good", ring: "ring-status-good/30", soft: "bg-status-good-soft" };
  if (aqi <= 200) return { label: "Moderate", tone: "text-status-moderate", ring: "ring-status-moderate/30", soft: "bg-status-moderate-soft" };
  if (aqi <= 300) return { label: "Poor", tone: "text-status-unhealthy", ring: "ring-status-unhealthy/30", soft: "bg-status-unhealthy-soft" };
  if (aqi <= 400) return { label: "Very Poor", tone: "text-status-unhealthy", ring: "ring-status-unhealthy/30", soft: "bg-status-unhealthy-soft" };
  return { label: "Severe", tone: "text-status-hazardous", ring: "ring-status-hazardous/30", soft: "bg-status-hazardous-soft" };
}
