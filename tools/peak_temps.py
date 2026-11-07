"""Extract monthly and annual peak hours, with dry-bulb temperature, from ISO-NE SMD hourly files.

Usage (run from anywhere; pass file paths as arguments):
    python -I tools/peak_temps.py data/isone/2023_smd_hourly.xlsx data/isone/2024_smd_hourly.xlsx \
        --zones "ISO NE CA" WCMA --out data/isone/peak_temps.csv

Download the yearly "YYYY SMD Hourly Data" workbooks in a browser from:
    https://www.iso-ne.com/isoexpress/web/reports/load-and-demand/-/tree/zone-info

Notes / assumptions:
- Peak hour = the hour with max load in each calendar month (monthly) and in the year (annual).
  Load column: "System_Load" if present (ISO NE CA sheet), else "RT_Demand".
  ISO-NE's billing peaks (RNS monthly network load, annual capacity peak) are defined in the tariff;
  this load maximum is a close proxy, not the official settlement determinant.
- Dry_Bulb is in degrees F as published by ISO-NE (system sheet is a weighted average; zone sheets
  use that zone's weather station). Converted to C as well.
- Hr_End is hour-ending, local prevailing time (e.g. 18 = 17:00-18:00).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd


def load_sheet(path: Path, sheet: str) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=sheet)
    df = df.dropna(subset=["Date", "Hr_End"])
    if df.empty:
        return df
    load_col = "System_Load" if "System_Load" in df.columns else "RT_Demand"
    missing = {load_col, "Dry_Bulb"} - set(df.columns)
    if missing:
        raise ValueError(f"{path.name}/{sheet}: missing columns {missing}")
    df = df.assign(
        Date=pd.to_datetime(df["Date"]),
        load_mw=pd.to_numeric(df[load_col], errors="coerce"),
        dry_bulb_f=pd.to_numeric(df["Dry_Bulb"], errors="coerce"),
        dew_point_f=pd.to_numeric(df.get("Dew_Point"), errors="coerce"),
        load_col=load_col,
    )
    return df.dropna(subset=["load_mw"])


def peaks(df: pd.DataFrame, zone: str, source: str) -> pd.DataFrame:
    df = df.assign(year=df["Date"].dt.year, month=df["Date"].dt.month)
    monthly = df.loc[df.groupby(["year", "month"])["load_mw"].idxmax()].assign(peak_type="monthly")
    annual = df.loc[df.groupby("year")["load_mw"].idxmax()].assign(peak_type="annual")
    out = pd.concat([monthly, annual], ignore_index=True)
    out = out.assign(
        zone=zone,
        source_file=source,
        dry_bulb_c=((out["dry_bulb_f"] - 32) * 5 / 9).round(1),
    )
    cols = ["zone", "peak_type", "year", "month", "Date", "Hr_End", "load_mw", "load_col",
            "dry_bulb_f", "dry_bulb_c", "dew_point_f", "source_file"]
    return out[cols].sort_values(["zone", "year", "peak_type", "month"])


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--zones", nargs="+", default=["ISO NE CA", "WCMA"],
                    help='Sheet names, e.g. "ISO NE CA" WCMA NEMA SEMA')
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args(argv)

    frames = []
    for f in args.files:
        for z in args.zones:
            df = load_sheet(f, z)
            if df.empty:
                print(f"warning: {f.name}/{z} has no data rows", file=sys.stderr)
                continue
            frames.append(peaks(df, z, f.name))
    if not frames:
        print("no data found", file=sys.stderr)
        return 1
    result = pd.concat(frames, ignore_index=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        result.to_csv(args.out, index=False)
        print(f"wrote {len(result)} rows to {args.out}")
    summary = (result.groupby(["zone", "peak_type"])["dry_bulb_f"]
               .describe()[["count", "mean", "min", "max"]].round(1))
    print(summary.to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
