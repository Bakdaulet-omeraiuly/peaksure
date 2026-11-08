"""Derive facility-load summaries for the EBS C&I scenario from public NREL/OpenEI building load profiles.

Raw inputs (NOT committed; re-download with --download):
  NREL, "Commercial and Residential Hourly Load Profiles for all TMY3 Locations in the United States" (2014,
  DOI 10.25984/1788456; superseded by End-Use Load Profiles, and flagged by NREL as containing errors).
  DOE commercial prototype buildings SIMULATED with Boston Logan TMY3 weather. These are modelled loads, not meter data.
Outputs (committed, small, derived):
  web/public/data/facility_loads.json                  monthly peaks, peak hours and peak-day shapes
  web/public/data/sample_facility_load_SYNTHETIC.csv  July, hourly, stand-alone retail, in the peaksure-facility-load/0.1 format
  data/public_data_manifest.json                       provenance, checksums, licence notes

Run: python tools/build_facility_loads.py [--download]
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/openei-loads"
BASE = ("https://openei.org/datasets/files/961/pub/COMMERCIAL_LOAD_DATA_E_PLUS_OUTPUT/"
        "USA_MA_Boston-Logan.Intl.AP.725090_TMY3/")
BUILDINGS = {
    "Stand-alone retail": "RefBldgStand-aloneRetailNew2004_v1.3_7.1_5A_USA_IL_CHICAGO-OHARE.csv",
    "Strip mall": "RefBldgStripMallNew2004_v1.3_7.1_5A_USA_IL_CHICAGO-OHARE.csv",
    "Small office": "RefBldgSmallOfficeNew2004_v1.3_7.1_5A_USA_IL_CHICAGO-OHARE.csv",
}
PRIMARY = "Stand-alone retail"
COL = "Electricity:Facility [kW](Hourly)"
YEAR = 2026            # TMY3 is a typical year with no calendar year; 2026 is a nominal label for weekdays only


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def _sum(rel: str) -> str | None:
    p = ROOT / rel
    return sha256(p) if p.exists() else None


def load(path: Path) -> pd.Series:
    d = pd.read_csv(path)
    raw = d["Date/Time"].str.strip()
    md, hh = raw.str.split(r"\s+", n=1, expand=True)[0], raw.str.split(r"\s+", n=1, expand=True)[1]
    hour_ending = hh.str.slice(0, 2).astype(int)                       # 1..24
    start = pd.to_datetime(f"{YEAR}/" + md, format="%Y/%m/%d") + pd.to_timedelta(hour_ending - 1, unit="h")
    s = pd.Series(d[COL].astype(float).values, index=start, name="kw")
    if s.isna().any() or len(s) != 8760 or s.index.duplicated().any():
        raise ValueError(f"{path.name}: unexpected shape or missing values")
    return s


def summarize(s: pd.Series) -> dict:
    months = []
    for m in range(1, 13):
        x = s[s.index.month == m]
        t = x.idxmax()
        day = x[x.index.normalize() == t.normalize()]
        months.append(dict(month=m, peak_kw=round(float(x.max()), 3), peak_date=str(t.date()), peak_he=int(t.hour) + 1,
                           weekday=t.day_name(), day_kw=[round(float(v), 3) for v in day.values]))
    return dict(annual_peak_kw=round(float(s.max()), 3), mean_kw=round(float(s.mean()), 3),
                annual_kwh=round(float(s.sum()), 1), months=months)


def main() -> int:
    RAW.mkdir(parents=True, exist_ok=True)
    if "--download" in sys.argv:
        for f in BUILDINGS.values():
            urllib.request.urlretrieve(BASE + f, RAW / f)
    out, files = {}, []
    for name, f in BUILDINGS.items():
        p = RAW / f
        if not p.exists():
            print(f"missing {p}; run with --download", file=sys.stderr)
            return 1
        s = load(p)
        out[name] = summarize(s)
        files.append(dict(name=name, file=f, url=BASE + f, sha256=sha256(p), rows=int(len(s)), committed=False))
        if name == PRIMARY:
            july = s[s.index.month == 7]
            sample = pd.DataFrame({"timestamp": july.index.strftime("%Y-%m-%dT%H:%M"), "kw": july.round(3).values})
            sp = ROOT / "web/public/data/sample_facility_load_SYNTHETIC.csv"
            sample.to_csv(sp, index=False)
    peak_hes = [m["peak_he"] for m in out[PRIMARY]["months"] if m["month"] in (6, 7, 8, 9)]
    meta = dict(
        contract="peaksure-facility-load/0.1", primary=PRIMARY, nominal_year=YEAR,
        classification="RELATED EXTERNAL DATA (simulated building loads; not REON, not metered)",
        source="NREL / DOE OEDI, Commercial and Residential Hourly Load Profiles for all TMY3 Locations in the United States, "
               "DOI 10.25984/1788456 (2014). Superseded by End-Use Load Profiles; NREL notes errors and limitations.",
        weather="Boston Logan TMY3 (typical year); building physics from the climate-zone 5A prototype",
        summer_peak_he=peak_hes, buildings=out,
        limits=["hourly averages; G-2 bills the greatest 15-minute demand", "typical-year weather, no calendar year",
                "prototype buildings, not a specific customer", "timestamps are interval starts (HE - 1)"],
    )
    (ROOT / "web/public/data/facility_loads.json").write_text(json.dumps(meta, indent=1) + "\n")
    manifest = dict(
        generated=str(dt.date.today()), script="tools/build_facility_loads.py",
        datasets=[
            dict(title="NREL Commercial Hourly Load Profiles (TMY3), Boston Logan", publisher="NREL / DOE OEDI",
                 doi="10.25984/1788456", licence="US federal (NREL/OEDI) public data; no explicit licence on the OSTI record",
                 classification="RELATED EXTERNAL DATA", downloaded=True, processed=True, files=files,
                 derived=["web/public/data/facility_loads.json", "web/public/data/sample_facility_load_SYNTHETIC.csv"]),
            dict(title="National Grid MA (Massachusetts Electric) delivery rates, M.D.P.U. No. 1-26-I, effective 2026-10-01",
                 publisher="National Grid",
                 url="https://www.nationalgridus.com/media/pdfs/billing-payments/tariffs/mae/meco_delivery.pdf",
                 classification="CONFIRMED tariff (not battery data)", downloaded=True, processed=True,
                 used="G-2 delivery demand charge $15.24/kW-month; customer charge $45.00",
                 sha256=_sum("data/tariffs/meco_delivery.pdf"),
                 committed=False),
            dict(title="National Grid MA G-2 tariff, M.D.P.U. No. 1547, effective 2024-10-01", publisher="National Grid",
                 url="https://www.nationalgridus.com/media/pdfs/billing-payments/tariffs/mae/meco_g2.pdf",
                 classification="CONFIRMED tariff terms", downloaded=True, processed=True,
                 used="billing demand = greatest 15-minute peak in the month; 200 kW eligibility limit",
                 sha256=_sum("data/tariffs/meco_g2.pdf"),
                 committed=False),
        ],
    )
    (ROOT / "data/public_data_manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print("wrote facility_loads.json, sample_facility_load_SYNTHETIC.csv, public_data_manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
