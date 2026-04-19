export type AqiStatus = "good" | "moderate" | "unhealthy" | "hazardous";

export interface PollutantReading {
  key: string;
  label: string;
  unit: string;
  value: number;
  status: AqiStatus;
  trend: number[]; // sparkline data
  delta: number; // % change vs previous hour
}

export const statusMeta: Record<
  AqiStatus,
  { label: string; text: string; bg: string; ring: string; dot: string }
> = {
  good: {
    label: "Good",
    text: "text-status-good",
    bg: "bg-status-good-soft",
    ring: "ring-status-good/20",
    dot: "bg-status-good",
  },
  moderate: {
    label: "Moderate",
    text: "text-status-moderate",
    bg: "bg-status-moderate-soft",
    ring: "ring-status-moderate/20",
    dot: "bg-status-moderate",
  },
  unhealthy: {
    label: "Unhealthy",
    text: "text-status-unhealthy",
    bg: "bg-status-unhealthy-soft",
    ring: "ring-status-unhealthy/20",
    dot: "bg-status-unhealthy",
  },
  hazardous: {
    label: "Hazardous",
    text: "text-status-hazardous",
    bg: "bg-status-hazardous-soft",
    ring: "ring-status-hazardous/20",
    dot: "bg-status-hazardous",
  },
};

const trend = (base: number, n = 16, jitter = 0.2) =>
  Array.from({ length: n }, (_, i) =>
    Math.max(0, base + Math.sin(i / 2) * base * jitter * 0.5 + (Math.random() - 0.5) * base * jitter),
  );

export const pollutants: PollutantReading[] = [
  {
    key: "pm25",
    label: "PM2.5",
    unit: "µg/m³",
    value: 86,
    status: "unhealthy",
    trend: trend(80),
    delta: 8.2,
  },
  {
    key: "pm10",
    label: "PM10",
    unit: "µg/m³",
    value: 142,
    status: "unhealthy",
    trend: trend(140),
    delta: 4.1,
  },
  {
    key: "so2",
    label: "SO₂",
    unit: "ppb",
    value: 18,
    status: "moderate",
    trend: trend(18),
    delta: -1.4,
  },
  {
    key: "no2",
    label: "NO₂ / NOx",
    unit: "ppb",
    value: 42,
    status: "moderate",
    trend: trend(40),
    delta: 2.7,
  },
  {
    key: "co",
    label: "CO",
    unit: "ppm",
    value: 0.7,
    status: "good",
    trend: trend(0.7),
    delta: -0.3,
  },
];

export const hourlyTrend = Array.from({ length: 24 }, (_, i) => {
  const hour = `${String(i).padStart(2, "0")}:00`;
  return {
    time: hour,
    pm25: Math.round(40 + Math.sin(i / 3) * 25 + Math.random() * 12),
    pm10: Math.round(70 + Math.sin(i / 3) * 40 + Math.random() * 18),
    no2: Math.round(25 + Math.cos(i / 4) * 15 + Math.random() * 6),
  };
});

export const sourceContribution = [
  { name: "Industrial Emission", value: 45 },
  { name: "Agricultural / Biomass Burning", value: 32 },
  { name: "Mixed Urban Pollution", value: 23 },
];

export interface OfficerCase {
  id: string;
  zone: string;
  pollutant: string;
  level: string;
  status: "Open" | "In Review" | "Resolved";
  assignee: string;
  updated: string;
}

export const officerCases: OfficerCase[] = [
  { id: "ENV-2041", zone: "Sector 7 — Industrial Belt", pollutant: "PM2.5", level: "High", status: "Open", assignee: "Officer Rao", updated: "2 min ago" },
  { id: "ENV-2039", zone: "North Ridge", pollutant: "SO₂", level: "Moderate", status: "In Review", assignee: "Officer Mehta", updated: "18 min ago" },
  { id: "ENV-2037", zone: "Riverfront East", pollutant: "NO₂", level: "Moderate", status: "Open", assignee: "Officer Khan", updated: "42 min ago" },
  { id: "ENV-2033", zone: "Greenfield Farms", pollutant: "PM10", level: "High", status: "Resolved", assignee: "Officer Iyer", updated: "1 h ago" },
  { id: "ENV-2031", zone: "City Center", pollutant: "CO", level: "Low", status: "Resolved", assignee: "Officer Das", updated: "3 h ago" },
];
