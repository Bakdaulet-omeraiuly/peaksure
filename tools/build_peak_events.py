"""Build the coincident-peak event table used by the PeakSure simulator.

For each month in the ISO-NE SMD hourly files:
  - system monthly peak (ISO NE CA, max System_Load) -> date, hour-ending (HE)
  - WCMA dry-bulb temperature at that same hour (Sterling / Holden region)
  - annual peak flag (the max-load month of each year)
  - hourly system load on the peak day (to show the peak-day shape in the demo)

Usage:
    python -I tools/build_peak_events.py data/isone/20*_smd_hourly.xlsx --outdir data/processed

Proxy note: ISO-NE settles RNS on monthly network load at the monthly system peak and the
capacity tag on the annual system peak; the max-System_Load hour is used as the proxy.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd


def read(path: Path, sheet: str, cols: list[str]) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=sheet, usecols=lambda c: c in cols)
    df = df.dropna(subset=["Date", "Hr_End"])
    df["Date"] = pd.to_datetime(df["Date"])
    # DST fall-back days carry an extra hour labelled e.g. "02X"; drop it (never a peak hour).
    df["Hr_End"] = pd.to_numeric(df["Hr_End"], errors="coerce")
    df = df.dropna(subset=["Hr_End"])
    df["Hr_End"] = df["Hr_End"].astype(int)
    return df


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--outdir", type=Path, required=True)
    args = ap.parse_args(argv)

    events, shapes = [], []
    for f in sorted(args.files):
        sysdf = read(f, "ISO NE CA", ["Date", "Hr_End", "System_Load", "Dry_Bulb"])
        wc = read(f, "WCMA", ["Date", "Hr_End", "RT_Demand", "Dry_Bulb"]).rename(
            columns={"Dry_Bulb": "wcma_dry_bulb_f", "RT_Demand": "wcma_load_mw"})
        df = sysdf.merge(wc, on=["Date", "Hr_End"], how="left")
        df["year"], df["month"] = df["Date"].dt.year, df["Date"].dt.month
        idx = df.groupby(["year", "month"])["System_Load"].idxmax()
        ev = df.loc[idx].copy()
        ann = ev.loc[ev.groupby("year")["System_Load"].idxmax(), ["year", "month"]]
        ev["is_annual"] = ev.set_index(["year", "month"]).index.isin(
            ann.set_index(["year", "month"]).index)
        events.append(ev)
        for _, r in ev.iterrows():
            day = df[df["Date"] == r["Date"]][["Date", "Hr_End", "System_Load", "wcma_dry_bulb_f"]]
            shapes.append(day.assign(year=r["year"], month=r["month"]))
        print(f"{f.name}: {len(ev)} monthly peaks", file=sys.stderr)

    ev = pd.concat(events, ignore_index=True).rename(columns={
        "System_Load": "system_load_mw", "Dry_Bulb": "system_dry_bulb_f"})
    ev["wcma_dry_bulb_c"] = ((ev["wcma_dry_bulb_f"] - 32) * 5 / 9).round(1)
    args.outdir.mkdir(parents=True, exist_ok=True)
    ev.to_csv(args.outdir / "peak_events.csv", index=False)
    pd.concat(shapes, ignore_index=True).to_csv(args.outdir / "peak_day_shapes.csv", index=False)
    print(f"wrote {len(ev)} events")
    print(ev.groupby("month")["Hr_End"].agg(lambda s: s.value_counts().to_dict()).to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
