"""Export paired annual REON baseline vs PeakSure outcomes from saved main runs."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pandas as pd

from peaksure.config import Config
from peaksure.econ import add_values, ci

events = pd.read_parquet(ROOT / "results/events_main.parquet")
events = add_values(events[(events.tag == "main") & events.cond.isin(["B", "C"])], Config())
annual = events.groupby(["run", "sim_year", "cond"], as_index=False).agg(
    savings=("value_usd", "sum"),
    peak_capture=("shaved_kw", lambda v: (v > 0).mean()),
)
paired = annual.pivot(index=["run", "sim_year"], columns="cond", values="savings").dropna()
rows = []
for year in sorted(annual.sim_year.unique()):
    block = annual[annual.sim_year == year]
    b = block[block.cond == "B"]
    c = block[block.cond == "C"]
    delta = paired.xs(year, level="sim_year")
    mean, lo, hi = ci((delta.C - delta.B).to_numpy())
    rows.append({
        "year": int(year + 1),
        "reon_usd": round(float(b.savings.mean())),
        "peaksure_usd": round(float(c.savings.mean())),
        "delta_usd": round(mean),
        "delta_lo_usd": round(lo),
        "delta_hi_usd": round(hi),
        "reon_capture": round(float(b.peak_capture.mean()), 4),
        "peaksure_capture": round(float(c.peak_capture.mean()), 4),
    })
target = ROOT / "web/public/data/yearly.json"
target.write_text(json.dumps({"n_runs": int(annual.run.nunique()), "rows": rows}))
print(target)
