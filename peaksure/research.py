"""Paired summaries for the three exploratory scientific extensions.

Every contrast uses the same seed, peak sequence and chemistry on both sides.
The mixed-age cohort and independent resting-SOC capability remain assumptions.
"""

from __future__ import annotations

import pandas as pd

from .config import Config
from . import econ


PAIRS = {
    "mixed": (("A_opt", "C"), ("C", "C_T3"), ("C", "C_LC")),
    "lifetime": (("C", "C_T3"), ("C", "C_LC")),
    "guard_null": (("C", "C_G"),),
    "guard_bias": (("C", "C_G"),),
}


def summary(events: pd.DataFrame, monthly: pd.DataFrame) -> list[dict]:
    rows: list[dict] = []
    for tag, pairs in PAIRS.items():
        ev = events[events.tag == tag].copy()
        mo = monthly[monthly.tag == tag].copy()
        if ev.empty or mo.empty:
            continue
        cfg = Config(initial_age_years=(0.0, 5.0, 10.0)) if tag == "mixed" else Config()
        rl = econ.run_level(ev, mo, cfg).set_index(["cond", "run"])
        final = mo.sort_values("m").groupby(["cond", "run"]).tail(1).set_index(["cond", "run"])
        miss = ev.assign(miss=ev.d_true < ev.d_p5).groupby(["cond", "run"])["miss"].mean()
        alert = ev.groupby(["cond", "run"])["guard_active"].mean()
        for baseline, candidate in pairs:
            runs = sorted(set(rl.loc[baseline].index) & set(rl.loc[candidate].index))
            if not runs:
                continue
            def delta(source, col=None):
                a = source.loc[baseline].loc[runs]
                b = source.loc[candidate].loc[runs]
                return (b[col] - a[col]).to_numpy(float) if col else (b - a).to_numpy(float)

            def triplet(x):
                return [round(float(v), 5) for v in econ.ci(x)]

            rows.append(dict(
                study=tag, baseline=baseline, candidate=candidate, n_runs=len(runs),
                savings_yr=triplet(delta(rl, "savings_yr")),
                npv=triplet(delta(rl, "npv")),
                end_energy_kwh=triplet(delta(final, "d_ref_kwh")),
                end_soh=triplet(delta(final, "soh_mean")),
                augmentation_kwh=triplet(delta(rl, "aug_kwh")),
                p5_miss_delta=triplet(delta(miss)),
                p5_miss_baseline=round(float(miss.loc[baseline].loc[runs].mean()), 5),
                p5_miss_candidate=round(float(miss.loc[candidate].loc[runs].mean()), 5),
                guard_alert_rate=round(float(alert.loc[candidate].loc[runs].mean()), 5),
            ))
    return rows
