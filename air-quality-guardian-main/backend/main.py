from __future__ import annotations

import json
import os
import smtplib
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
      line = raw_line.strip()
      if not line or line.startswith("#") or "=" not in line:
          continue

      key, value = line.split("=", 1)
      key = key.strip()
      value = value.strip().strip('"').strip("'")
      if key and key not in os.environ:
          os.environ[key] = value


load_env_file(BASE_DIR / ".env")
load_env_file(ROOT_DIR / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
GPCB_RECIPIENT = os.getenv("GPCB_RECIPIENT", "ocmms.pcb@gov.in")
ENGINEER_RECIPIENT = os.getenv("ENGINEER_RECIPIENT", "see-gspcb@gov.in")

POLLUTANTS = ["PM2.5", "PM10", "NO", "NO2", "NOx", "SO2", "CO"]
THRESHOLDS = {
    "PM2.5": 60,
    "PM10": 150,
    "NO": 80,
    "NO2": 80,
    "NOx": 200,
    "SO2": 100,
    "CO": 4,
}
WIND_MAP = {
    "N": "North Zone",
    "S": "South Zone",
    "E": "East Zone",
    "W": "West Zone",
    "NE": "Vatva Industrial Area",
    "NW": "Sabarmati Area",
    "SE": "Narol Area",
    "SW": "Odhav Area",
}
WIND_DEGREES = {"N": 0, "NE": 45, "E": 90, "SE": 135, "S": 180, "SW": 225, "W": 270, "NW": 315}
WIND_SPEEDS = [6, 8, 10, 12, 14, 16, 18, 20, 22]
DISPLAY_POLLUTANTS = ["PM2.5", "PM10", "SO2", "NO2", "CO"]

AQI_TABLES = {
    "PM2.5": [
        (0, 30, 0, 50),
        (31, 60, 51, 100),
        (61, 90, 101, 200),
        (91, 120, 201, 300),
        (121, 250, 301, 400),
        (251, 500, 401, 500),
    ],
    "PM10": [
        (0, 50, 0, 50),
        (51, 100, 51, 100),
        (101, 250, 101, 200),
        (251, 350, 201, 300),
        (351, 430, 301, 400),
        (431, 800, 401, 500),
    ],
    "NO2": [
        (0, 40, 0, 50),
        (41, 80, 51, 100),
        (81, 180, 101, 200),
        (181, 280, 201, 300),
        (281, 400, 301, 400),
        (401, 800, 401, 500),
    ],
    "SO2": [
        (0, 40, 0, 50),
        (41, 80, 51, 100),
        (81, 380, 101, 200),
        (381, 800, 201, 300),
        (801, 1600, 301, 400),
        (1601, 3200, 401, 500),
    ],
    "CO": [
        (0, 1, 0, 50),
        (1.1, 2, 51, 100),
        (2.1, 10, 101, 200),
        (10.1, 17, 201, 300),
        (17.1, 34, 301, 400),
        (34.1, 60, 401, 500),
    ],
}

app = FastAPI(title="Air Quality Guardian API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DispatchRequest(BaseModel):
    fault_id: int


class EmailRequest(BaseModel):
    incident_count: int = 0
    summary: str | None = None


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        text = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _to_float(value: Any) -> float | None:
    if value is None or value == "" or value == "None":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _stable_wind(seed: int) -> str:
    keys = list(WIND_MAP.keys())
    return keys[abs(seed) % len(keys)]


def _stable_wind_speed(seed: int) -> int:
    return WIND_SPEEDS[abs(seed) % len(WIND_SPEEDS)]


def _classify_source(exceeded: list[str]) -> str:
    agri = 0
    ind = 0
    if "PM2.5" in exceeded:
        agri += 2
    if "PM10" in exceeded:
        agri += 2
    if "CO" in exceeded:
        agri += 1
    if "NO2" in exceeded:
        ind += 2
    if "SO2" in exceeded:
        ind += 2
    if "NOx" in exceeded:
        ind += 2
    if "CO" in exceeded:
        ind += 1
    if agri > ind:
        return "Agricultural / Biomass Burning"
    if ind > agri:
        return "Industrial Emission"
    return "Mixed Urban Pollution"


def _get_severity(exceeded: list[str]) -> str:
    if len(exceeded) >= 4:
        return "HIGH"
    if len(exceeded) >= 2:
        return "MEDIUM"
    return "LOW"


def _require_supabase() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")


def _supabase_request(method: str, path: str, params: dict[str, Any] | None = None, body: Any = None) -> Any:
    _require_supabase()
    url = f"{SUPABASE_URL}/rest/v1/{path.lstrip('/')}"
    if params:
        query = urllib.parse.urlencode(params, doseq=True)
        url = f"{url}?{query}"

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Accept": "application/json",
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"
        data = json.dumps(body, default=str).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8") if exc.fp else exc.reason
        raise HTTPException(status_code=exc.code, detail=detail)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc))


def _query(table: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    return _supabase_request("GET", table, params=params)


def _insert(table: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return []
    return _supabase_request("POST", table, body=rows)


def _update(table: str, filters: dict[str, str], payload: dict[str, Any]) -> list[dict[str, Any]]:
    params = {k: v for k, v in filters.items()}
    return _supabase_request("PATCH", table, params=params, body=payload)


def _send_email(to: str, subject: str, text: str) -> None:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        raise HTTPException(status_code=500, detail="Set GMAIL_USER and GMAIL_APP_PASSWORD")

    message = EmailMessage()
    message["From"] = GMAIL_USER
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as smtp:
        smtp.starttls()
        smtp.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        smtp.send_message(message)


def _status_for(pollutant: str, value: float) -> str:
    threshold = THRESHOLDS[pollutant]
    if value <= threshold * 0.5:
        return "good"
    if value <= threshold:
        return "moderate"
    if value <= threshold * 1.5:
        return "unhealthy"
    return "hazardous"


def _group_hour(dt: datetime) -> datetime:
    return dt.replace(minute=0, second=0, microsecond=0)


def _map_wind(cardinal: str | None) -> tuple[int, str]:
    cardinal = (cardinal or "NW").upper()
    return WIND_DEGREES.get(cardinal, 315), cardinal


def _sub_index(pollutant: str, value: float) -> int | None:
    table = AQI_TABLES.get(pollutant)
    if not table or not isinstance(value, (int, float)):
        return None
    for lo, hi, i_lo, i_hi in table:
        if lo <= value <= hi:
            if hi == lo:
                return i_hi
            return round(((i_hi - i_lo) / (hi - lo)) * (value - lo) + i_lo)
    if value > table[-1][1]:
        return 500
    return None


def _compute_aqi(values: dict[str, float]) -> tuple[int, str | None]:
    max_aqi = 0
    dominant = None
    for pollutant, value in values.items():
        sub = _sub_index(pollutant, value)
        if sub is not None and sub > max_aqi:
            max_aqi = sub
            dominant = pollutant
    return max_aqi, dominant


def _incident_to_api(row: dict[str, Any]) -> dict[str, Any]:
    from_ts = _parse_dt(row.get("from_ts") or row.get("from"))
    to_ts = _parse_dt(row.get("to_ts") or row.get("to"))
    pollutants = row.get("pollutants") or []
    if isinstance(pollutants, str):
        pollutants = [p.strip() for p in pollutants.split(",") if p.strip()]
    peak_pollutant = row.get("peak_pollutant") or (pollutants[0] if pollutants else "PM2.5")
    return {
        "id": row.get("incident_code") or row.get("id"),
        "from": from_ts,
        "to": to_ts,
        "durationHours": row.get("duration_hours") or row.get("durationHours") or 0,
        "pollutants": pollutants,
        "wind": row.get("wind") or "NW",
        "windSpeed": row.get("wind_speed") or row.get("windSpeed") or 12,
        "zone": row.get("zone") or "Maninagar, Ahmedabad",
        "category": row.get("category") or "Mixed Urban Pollution",
        "severity": row.get("severity") or "LOW",
        "peakValue": row.get("peak_value") or row.get("peakValue") or 0,
        "peakPollutant": peak_pollutant,
    }


def _fault_to_api(row: dict[str, Any]) -> dict[str, Any]:
    created = _parse_dt(row.get("created_at") or row.get("ts"))
    return {
        "id": row.get("id"),
        "ts": created,
        "pollutant": row.get("pollutant"),
        "value": row.get("stuck_value") or row.get("value"),
        "streak": row.get("streak") or 3,
        "zone": row.get("zone") or "Maninagar, Ahmedabad",
        "status": row.get("status") or "PENDING",
    }


def _fetch_sensor_rows(limit: int = 500) -> list[dict[str, Any]]:
    rows = _query(
        "sensor_readings",
        params={"select": "ts,pollutant,value,zone", "order": "ts.desc", "limit": str(limit)},
    )
    for row in rows:
        row["ts"] = _parse_dt(row.get("ts"))
        row["value"] = _to_float(row.get("value"))
    return rows


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "supabase": bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)}


@app.get("/api/dashboard/pollutants")
def dashboard_pollutants() -> list[dict[str, Any]]:
    rows = _fetch_sensor_rows()
    if not rows:
        return []

    latest: dict[str, dict[str, Any]] = {}
    history: dict[str, list[float]] = defaultdict(list)
    for row in reversed(rows):
        pollutant = row.get("pollutant")
        value = row.get("value")
        if pollutant not in THRESHOLDS or value is None:
            continue
        latest[pollutant] = row
        history[pollutant].append(value)

    display = ["PM2.5", "PM10", "SO2", "NO2", "CO"]
    out = []
    for pollutant in display:
        row = latest.get(pollutant)
        value = round(row["value"], 2) if row and row.get("value") is not None else 0
        trend = history.get(pollutant, [])[-16:]
        prev = trend[-2] if len(trend) > 1 else value
        delta = round(((value - prev) / prev * 100), 1) if prev else 0
        out.append(
            {
                "key": pollutant.lower().replace(".", ""),
                "label": pollutant,
                "unit": "µg/m³" if pollutant != "CO" else "mg/m³",
                "value": value,
                "status": _status_for(pollutant, value),
                "trend": trend,
                "delta": delta,
            }
        )
    return out


@app.get("/api/dashboard/hourly-trend")
def dashboard_hourly_trend(hours: int = 24) -> list[dict[str, Any]]:
    cutoff = _now_utc() - timedelta(hours=hours)
    rows = _query(
        "sensor_readings",
        params={"select": "ts,pollutant,value", "ts": f"gte.{cutoff.isoformat()}", "order": "ts.asc"},
    )
    buckets: dict[datetime, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        ts = _parse_dt(row.get("ts"))
        value = _to_float(row.get("value"))
        pollutant = row.get("pollutant")
        if not ts or value is None or pollutant not in {"PM2.5", "PM10", "NO2"}:
            continue
        buckets[_group_hour(ts)][pollutant].append(value)

    ordered_hours = [cutoff.replace(minute=0, second=0, microsecond=0) + timedelta(hours=i) for i in range(hours)]
    return [
        {
            "time": dt.strftime("%H:00"),
            "pm25": round(sum(buckets.get(dt, {}).get("PM2.5", [0])) / max(1, len(buckets.get(dt, {}).get("PM2.5", [0])))),
            "pm10": round(sum(buckets.get(dt, {}).get("PM10", [0])) / max(1, len(buckets.get(dt, {}).get("PM10", [0])))),
            "no2": round(sum(buckets.get(dt, {}).get("NO2", [0])) / max(1, len(buckets.get(dt, {}).get("NO2", [0])))),
        }
        for dt in ordered_hours
    ]


@app.get("/api/dashboard/source-insight")
def dashboard_source_insight() -> dict[str, Any]:
    incidents = _query("incidents", params={"select": "category,zone", "order": "created_at.desc", "limit": "500"})
    if not incidents:
        return {
            "contribution": [],
            "dominant": "None",
            "confidence": 0,
            "reasoning": "No incidents available yet.",
            "totalIncidents": 0,
            "topZone": "None",
        }

    categories = Counter((row.get("category") or "Mixed Urban Pollution") for row in incidents)
    zones = Counter((row.get("zone") or "Unknown") for row in incidents)
    total = sum(categories.values())
    dominant, dominant_count = categories.most_common(1)[0]
    top_zone, _ = zones.most_common(1)[0]
    return {
        "contribution": [{"name": name, "value": round(count / total * 100)} for name, count in categories.most_common()],
        "dominant": dominant,
        "confidence": round(dominant_count / total * 100),
        "reasoning": f"Across {total} incidents, {dominant} is the most common attribution.",
        "totalIncidents": total,
        "topZone": top_zone,
    }


@app.get("/api/dashboard/wind")
def dashboard_wind() -> dict[str, Any]:
    incidents = _query("incidents", params={"select": "wind,wind_speed,zone", "order": "created_at.desc", "limit": "1"})
    if not incidents:
        return {"degrees": 315, "cardinal": "NW", "speed": 12}
    wind = (incidents[0].get("wind") or "NW").upper()
    degrees, cardinal = _map_wind(wind)
    return {"degrees": degrees, "cardinal": cardinal, "speed": incidents[0].get("wind_speed") or 12}


@app.get("/api/dashboard/incidents")
def dashboard_incidents(hours: int = 24) -> list[dict[str, Any]]:
    cutoff = _now_utc() - timedelta(hours=hours)
    rows = _query(
        "incidents",
        params={"select": "*", "from_ts": f"gte.{cutoff.isoformat()}", "order": "from_ts.desc"},
    )
    return [_incident_to_api(row) for row in rows]


@app.get("/api/dashboard/dataset-latest")
def dashboard_dataset_latest() -> datetime | None:
    rows = _query("sensor_readings", params={"select": "ts", "order": "ts.desc", "limit": "1"})
    if rows:
        return _parse_dt(rows[0].get("ts"))
    incidents = _query("incidents", params={"select": "to_ts", "order": "to_ts.desc", "limit": "1"})
    return _parse_dt(incidents[0].get("to_ts")) if incidents else None


@app.get("/api/dashboard/dataset-range")
def dashboard_dataset_range() -> dict[str, datetime | None]:
    newest = _query("sensor_readings", params={"select": "ts", "order": "ts.desc", "limit": "1"})
    oldest = _query("sensor_readings", params={"select": "ts", "order": "ts.asc", "limit": "1"})
    if newest and oldest:
        return {"start": _parse_dt(oldest[0].get("ts")), "end": _parse_dt(newest[0].get("ts"))}
    return {"start": None, "end": None}


@app.get("/api/dashboard/spikes")
def dashboard_spikes(hours: int = 24) -> list[dict[str, Any]]:
    incidents = dashboard_incidents(hours)
    spikes: list[dict[str, Any]] = []
    for incident in incidents:
        pollutants = incident.get("pollutants") or []
        peak = incident.get("peakPollutant") or (pollutants[0] if pollutants else "PM2.5")
        for index, pollutant in enumerate(pollutants):
            threshold = THRESHOLDS.get(pollutant, 1)
            value = incident.get("peakValue") * threshold if pollutant == peak else threshold * 1.1
            spikes.append(
                {
                    "id": f"{incident['id']}-{index + 1}",
                    "timestamp": incident["from"],
                    "pollutant": pollutant,
                    "value": round(value, 2),
                    "unit": "µg/m³",
                    "threshold": threshold,
                    "zone": incident.get("zone"),
                    "severity": "Hazardous" if incident.get("severity") == "HIGH" else "High" if incident.get("severity") == "MEDIUM" else "Moderate",
                }
            )
    return spikes


@app.get("/api/dashboard/realtime")
def dashboard_realtime(limit: int = 120) -> dict[str, Any]:
    rows = _query(
        "sensor_readings",
        params={"select": "ts,pollutant,value,zone", "order": "ts.desc", "limit": str(max(1, limit * 8))},
    )
    rows.reverse()

    grouped: dict[str, dict[str, float]] = defaultdict(dict)
    for row in rows:
        ts = row.get("ts")
        pollutant = row.get("pollutant")
        value = _to_float(row.get("value"))
        if not ts or pollutant not in POLLUTANTS or value is None:
            continue
        grouped[str(ts)][pollutant] = value

    ordered = list(grouped.items())[-limit:]
    points = []
    for ts, values in ordered:
        dt = _parse_dt(ts)
        if not dt:
          continue
        aqi, dominant = _compute_aqi(values)
        points.append(
            {
                "ts": int(dt.timestamp() * 1000),
                "time": dt.strftime("%H:%M"),
                "aqi": aqi,
                "dominant": dominant,
                "values": values,
            }
        )

    latest_spike = None
    spike_rows = _query("incidents", params={"select": "*", "order": "created_at.desc", "limit": "1"})
    if spike_rows:
      spike_rows[0]["from_ts"] = spike_rows[0].get("from_ts") or spike_rows[0].get("from")
      incident = _incident_to_api(spike_rows[0])
      if incident.get("pollutants"):
        latest_spike = {
            "id": f"SPK-{incident['id']}",
            "ts": int((incident["to"] or incident["from"]).timestamp() * 1000),
            "pollutant": incident["peakPollutant"],
            "value": incident["peakValue"],
            "aqi": 300 if incident["severity"] == "HIGH" else 220 if incident["severity"] == "MEDIUM" else 150,
            "zone": incident["zone"],
            "band": "Severe" if incident["severity"] == "HIGH" else "Poor" if incident["severity"] == "MEDIUM" else "Moderate",
        }

    return {"points": points, "latestSpike": latest_spike}


@app.get("/api/fault-alerts")
def list_fault_alerts(status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    params = {"select": "*", "order": "created_at.desc", "limit": str(limit)}
    if status:
        params["status"] = f"eq.{status}"
    rows = _query("fault_alerts", params=params)
    return [_fault_to_api(row) for row in rows]


@app.post("/api/fault-alerts/{fault_id}/dispatch")
def dispatch_fault(fault_id: int) -> dict[str, Any]:
    rows = _query("fault_alerts", params={"select": "*", "id": f"eq.{fault_id}", "limit": "1"})
    if not rows:
        raise HTTPException(status_code=404, detail="Fault not found")

    fault = _fault_to_api(rows[0])
    subject = f"Maintenance dispatch: {fault['pollutant']} sensor fault"
    body = (
        "Dear Senior Head Engineer,\n\n"
        f"A possible sensor fault has been detected on the Maninagar CAAQMS feed.\n\n"
        f"Pollutant: {fault['pollutant']}\n"
        f"Stuck value: {fault['value']}\n"
        f"Consecutive readings: {fault['streak']}\n"
        f"Location: {fault['zone']}\n"
        f"Time: {fault['ts']}\n\n"
        "Please review and dispatch maintenance.\n\n"
        "Regards,\nAir Quality Guardian"
    )

    _send_email(ENGINEER_RECIPIENT, subject, body)
    updated = _update("fault_alerts", {"id": f"eq.{fault_id}"}, {"status": "DISPATCHED"})
    _insert(
        "maintenance_dispatches",
        [
            {
                "fault_id": fault_id,
                "sent_to": ENGINEER_RECIPIENT,
                "subject": subject,
                "body": body,
                "status": "SENT",
            }
        ],
    )
    return {"ok": True, "fault": updated[0] if updated else fault}


@app.post("/api/send-gpcb-email")
def send_gpcb_email(payload: EmailRequest) -> dict[str, Any]:
    subject = "Maninagar CAAQMS pollution summary report"
    body = (
        "Dear GPCB Team,\n\n"
        "Please review the latest pollution summary report for Maninagar CAAQMS.\n\n"
        f"Incidents in selected window: {payload.incident_count}\n\n"
        "Regards,\nAir Quality Guardian"
    )
    if payload.summary:
        body = f"{body}\n{payload.summary}"
    _send_email(GPCB_RECIPIENT, subject, body)
    return {"ok": True}


def _parse_uploaded_file(upload: UploadFile) -> pd.DataFrame:
    suffix = Path(upload.filename or "dataset.xlsx").suffix.lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(upload.file.read())
        tmp_path = Path(tmp.name)

    try:
        if suffix == ".csv":
            df = pd.read_csv(tmp_path)
        else:
            df = pd.read_excel(tmp_path, skiprows=16)
    finally:
        tmp_path.unlink(missing_ok=True)

    df.columns = [str(c).strip() for c in df.columns]
    return df


def _process_dataframe(df: pd.DataFrame) -> dict[str, Any]:
    if "From Date" not in df.columns or "To Date" not in df.columns:
        raise HTTPException(status_code=400, detail="Dataset is missing From Date / To Date columns")

    for pollutant in POLLUTANTS:
        if pollutant in df.columns:
            df[pollutant] = pd.to_numeric(df[pollutant], errors="coerce")

    df["From Date"] = pd.to_datetime(df["From Date"], dayfirst=True, errors="coerce")
    df["To Date"] = pd.to_datetime(df["To Date"], dayfirst=True, errors="coerce")
    df = df.dropna(subset=["From Date", "To Date"])

    readings: list[dict[str, Any]] = []
    incidents: list[dict[str, Any]] = []
    faults: list[dict[str, Any]] = []
    last_values: dict[str, float | None] = {p: None for p in POLLUTANTS}
    streaks: dict[str, int] = {p: 0 for p in POLLUTANTS}

    for idx, row in df.iterrows():
        from_dt = row["From Date"].to_pydatetime() if hasattr(row["From Date"], "to_pydatetime") else row["From Date"]
        to_dt = row["To Date"].to_pydatetime() if hasattr(row["To Date"], "to_pydatetime") else row["To Date"]
        seed = int(from_dt.timestamp())
        wind = _stable_wind(seed)
        wind_speed = _stable_wind_speed(seed >> 3)
        zone = WIND_MAP[wind]

        values: dict[str, float] = {}
        exceeded: list[str] = []
        peak_ratio = 0.0
        peak_pollutant = "PM2.5"

        for pollutant in POLLUTANTS:
            value = _to_float(row.get(pollutant))
            if value is None:
                continue
            values[pollutant] = value
            readings.append(
                {
                    "ts": to_dt.isoformat(),
                    "pollutant": pollutant,
                    "value": value,
                    "zone": zone,
                    "source": "caaqms",
                }
            )

            if value > THRESHOLDS[pollutant]:
                exceeded.append(pollutant)
                ratio = value / THRESHOLDS[pollutant]
                if ratio > peak_ratio:
                    peak_ratio = ratio
                    peak_pollutant = pollutant

            if last_values[pollutant] == value:
                streaks[pollutant] += 1
            else:
                streaks[pollutant] = 1
            last_values[pollutant] = value

            if streaks[pollutant] == 3:
                faults.append(
                    {
                        "sensor_name": "Maninagar CAAQMS",
                        "pollutant": pollutant,
                        "stuck_value": value,
                        "streak": 3,
                        "zone": zone,
                        "status": "PENDING",
                    }
                )

        if exceeded:
            incidents.append(
                {
                    "incident_code": f"INC-{idx + 1:05d}",
                    "from_ts": from_dt.isoformat(),
                    "to_ts": to_dt.isoformat(),
                    "duration_hours": round((to_dt - from_dt).total_seconds() / 3600, 2),
                    "pollutants": exceeded,
                    "severity": _get_severity(exceeded),
                    "category": _classify_source(exceeded),
                    "zone": zone,
                    "wind": wind,
                    "wind_speed": wind_speed,
                    "peak_value": peak_ratio,
                    "peak_pollutant": peak_pollutant,
                }
            )

    _insert("sensor_readings", readings)
    _insert("incidents", incidents)
    _insert("fault_alerts", faults)

    return {"readings": len(readings), "incidents": len(incidents), "faults": len(faults)}


@app.post("/api/import-dataset")
async def import_dataset(file: UploadFile = File(...)) -> dict[str, Any]:
    df = _parse_uploaded_file(file)
    return _process_dataframe(df)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Air Quality Guardian API"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
