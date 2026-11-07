"""Real ISO-NE peak data (from tools/build_peak_events.py) and the peak-hour forecast model."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
HE_GRID = np.arange(12, 23)          # hour-ending candidates for a peak window (HE12..HE22)
SEASON = {12: "winter", 1: "winter", 2: "winter", 11: "winter",
          3: "spring", 4: "spring", 5: "spring",
          6: "summer", 7: "summer", 8: "summer", 9: "summer", 10: "fall"}

# Approximate monthly mean ambient temperature, central Massachusetts (degC) for calendar ageing.
# ASSUMED climatology (order of NOAA normals for Worcester); only drives calendar ageing.
MONTH_MEAN_C = np.array([-5, -4, 0, 7, 13, 18, 21, 20, 16, 9, 4, -2], dtype=float)


@lru_cache(maxsize=1)
def peak_events() -> pd.DataFrame:
    df = pd.read_csv(PROCESSED / "peak_events.csv", parse_dates=["Date"])
    full = df.groupby("year")["month"].nunique()
    df = df[df["year"].isin(full[full == 12].index)].copy()   # full years only (2019-2025)
    df["season"] = df["month"].map(SEASON)
    return df.reset_index(drop=True)


@lru_cache(maxsize=1)
def peak_day_shapes() -> pd.DataFrame:
    return pd.read_csv(PROCESSED / "peak_day_shapes.csv", parse_dates=["Date"])


def hour_forecast(month: int, exclude_year: int | None, alpha: float = 0.5) -> np.ndarray:
    """P(peak hour = HE) for a month, from other years' peaks in the same season (leave-one-year-out),
    with add-alpha smoothing over HE_GRID. Peak day is assumed known (MMWEC reported peak-calling
    accuracy), so only the hour is uncertain."""
    ev = peak_events()
    pool = ev[(ev["season"] == SEASON[month]) & (ev["year"] != exclude_year)]
    counts = np.array([(pool["Hr_End"] == h).sum() for h in HE_GRID], dtype=float) + alpha
    return counts / counts.sum()


def event_years() -> np.ndarray:
    return np.sort(peak_events()["year"].unique())


def sample_event_sequence(rng: np.random.Generator, years: int) -> pd.DataFrame:
    """Bootstrap whole historical years (keeps each year's annual peak structure)."""
    ev = peak_events()
    src = rng.choice(event_years(), size=years, replace=True)
    rows = []
    for y_idx, sy in enumerate(src):
        yr = ev[ev["year"] == sy].sort_values("month")
        for _, r in yr.iterrows():
            rows.append(dict(sim_year=y_idx, month=int(r["month"]), src_year=int(sy),
                             he=int(r["Hr_End"]), t_amb_c=float(r["wcma_dry_bulb_c"]),
                             is_annual=bool(r["is_annual"])))
    return pd.DataFrame(rows)
