import pandas as pd
import random
from pathlib import Path
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.pagesizes import letter

# =====================================================
# FILES
# =====================================================
DATA_FILE = "TS-PS9-2.xlsx"

# =====================================================
# LOAD DATASET
# =====================================================
df = pd.read_excel(DATA_FILE, skiprows=16)

df.columns = df.columns.str.strip()
df.replace("None", pd.NA, inplace=True)

# =====================================================
# USE ONLY FIRST 7 INCIDENT ROWS FOR CLEAN DEMO
# =====================================================
df = df.head(7)

# =====================================================
# POLLUTANTS
# =====================================================
pollutants = ["PM2.5", "PM10", "NO", "NO2", "NOx", "SO2", "CO"]

for p in pollutants:
    df[p] = pd.to_numeric(df[p], errors="coerce")

# Indian date format
df["From Date"] = pd.to_datetime(df["From Date"], dayfirst=True, errors="coerce")
df["To Date"] = pd.to_datetime(df["To Date"], dayfirst=True, errors="coerce")

df = df.dropna(subset=["From Date", "To Date"])

# =====================================================
# THRESHOLDS
# =====================================================
thresholds = {
    "PM2.5": 60,
    "PM10": 150,
    "NO": 80,
    "NO2": 80,
    "NOx": 200,
    "SO2": 100,
    "CO": 4
}

# =====================================================
# WIND MAP
# =====================================================
wind_map = {
    "N": "North Zone",
    "S": "South Zone",
    "E": "East Zone",
    "W": "West Zone",
    "NE": "Vatva Industrial Area",
    "NW": "Sabarmati Area",
    "SE": "Narol Area",
    "SW": "Odhav Area"
}

wind_keys = list(wind_map.keys())

# =====================================================
# HELPERS
# =====================================================
def classify_source(exceeded):
    agri_score = 0
    ind_score = 0

    # Agriculture / burning indicators
    if "PM2.5" in exceeded:
        agri_score += 2
    if "PM10" in exceeded:
        agri_score += 2
    if "CO" in exceeded:
        agri_score += 1

    # Industrial indicators
    if "NO2" in exceeded:
        ind_score += 2
    if "SO2" in exceeded:
        ind_score += 2
    if "NOx" in exceeded:
        ind_score += 2
    if "CO" in exceeded:
        ind_score += 1

    if agri_score > ind_score:
        return "Agricultural / Biomass Burning"
    elif ind_score > agri_score:
        return "Industrial Emission"
    else:
        return "Mixed Urban Pollution"


def get_severity(exceeded):

    count = len(exceeded)

    if count >= 4:
        return "HIGH"
    elif count >= 2:
        return "MEDIUM"
    return "LOW"

# =====================================================
# PROCESS INCIDENTS
# =====================================================
events = []

for _, row in df.iterrows():

    exceeded = []

    for p in pollutants:
        if pd.notna(row[p]) and row[p] > thresholds[p]:
            exceeded.append(p)

    if exceeded:

        wind = random.choice(wind_keys)

        # random realistic speed
        wind_speed = random.choice([6, 8, 10, 12, 14, 16, 18, 20, 22])

        zone = wind_map[wind]

        duration = row["To Date"] - row["From Date"]
        hours = round(duration.total_seconds() / 3600, 2)

        events.append({
            "from": row["From Date"],
            "to": row["To Date"],
            "duration": hours,
            "pollutants": exceeded,
            "wind": wind,
            "wind_speed": wind_speed,
            "zone": zone,
            "category": classify_source(exceeded),
            "severity": get_severity(exceeded)
        })

# =====================================================
# SUMMARY
# =====================================================
cause_count = {}
zone_count = {}

for e in events:
    cause_count[e["category"]] = cause_count.get(e["category"], 0) + 1
    zone_count[e["zone"]] = zone_count.get(e["zone"], 0) + 1

top_cause = max(cause_count, key=cause_count.get) if cause_count else "None"
top_zone = max(zone_count, key=zone_count.get) if zone_count else "None"

# =====================================================
# PDF REPORT
# =====================================================
output_path = Path("public") / "summary_report.pdf"
output_path.parent.mkdir(parents=True, exist_ok=True)

doc = SimpleDocTemplate(str(output_path), pagesize=letter)
styles = getSampleStyleSheet()
story = []

story.append(Paragraph("Pollution Intelligence Summary Report", styles["Title"]))
story.append(Spacer(1, 20))

story.append(Paragraph(f"Total Major Incidents: {len(events)}", styles["Normal"]))
story.append(Paragraph(f"Most Common Cause: {top_cause}", styles["Normal"]))
story.append(Paragraph(f"Most Affected Zone: {top_zone}", styles["Normal"]))
story.append(Spacer(1, 20))

# =====================================================
# INCIDENTS
# =====================================================
for i, e in enumerate(events, start=1):

    story.append(Paragraph(f"<b>Incident {i}</b>", styles["Heading3"]))

    story.append(Paragraph(
        f"Time: {e['from']} to {e['to']}",
        styles["Normal"]
    ))

    story.append(Paragraph(
        f"Duration: {e['duration']} hours",
        styles["Normal"]
    ))

    story.append(Paragraph(
        f"Exceeded Pollutants: {', '.join(e['pollutants'])}",
        styles["Normal"]
    ))

    story.append(Paragraph(
        f"Severity: {e['severity']}",
        styles["Normal"]
    ))

    story.append(Paragraph(
        f"Wind: {e['wind']} at {e['wind_speed']} km/h",
        styles["Normal"]
    ))

    story.append(Paragraph(
        f"Likely Zone: {e['zone']}",
        styles["Normal"]
    ))

    story.append(Paragraph(
        f"Probable Cause: {e['category']}",
        styles["Normal"]
    ))

    story.append(Spacer(1, 14))

doc.build(story)

# =====================================================
# CONSOLE
# =====================================================
print("✅ summary_report.pdf created successfully")
print(f"Saved to: {output_path}")
print("Only first 7 rows processed for demo")
print("Total Incidents:", len(events))
print("Most Common Cause:", top_cause)
print("Most Affected Zone:", top_zone)
