"""Economics and statistics on simulated events.

Monthly transmission (RNS): $/kW-yr charged on monthly network load -> each monthly peak is
worth RNS_y / 12 per kW shaved. Annual capacity: FCA $/kW-month x 12 on the annual peak.
All dollar figures are model outputs under the stated (flagged) assumptions.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import Config

TOWNS = {
    "Holden": dict(customers=8653, peak_mw=26.4, src="MMWEC 'who we serve' page"),
    "Sterling": dict(customers=4013, peak_mw=13.6, src="MMWEC 'who we serve' page (year not stated)"),
}


def rns_rate(cfg: Config, cal_year: int) -> float:
    rate = cfg.rns_2026
    for i, inc in enumerate(cfg.rns_increments):
        if cal_year >= 2027 + i:
            rate += inc
    return rate


def add_values(ev: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    ev = ev.copy()
    cal = cfg.start_year + ev["sim_year"]
    rns_m = cal.map(lambda y: rns_rate(cfg, int(y)) / 12.0)
    cap = cfg.fca_kw_month * 12.0
    ev["value_usd"] = ev["shaved_kw"] * rns_m + np.where(ev["is_annual"], ev["shaved_kw"] * cap, 0.0)
    ev["ceiling_usd"] = cfg.p_max_kw * rns_m + np.where(ev["is_annual"], cfg.p_max_kw * cap, 0.0)
    ev["miss_usd"] = np.where(ev["shaved_kw"] < ev["power_kw"] - 1e-9,
                              ev["power_kw"] * rns_m + np.where(ev["is_annual"], ev["power_kw"] * cap, 0.0)
                              - ev["value_usd"], 0.0)
    return ev


def run_level(ev: pd.DataFrame, mo: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    """Per (cond, run): mean annual savings, NPV, success rate, augmentation."""
    ev = add_values(ev, cfg)
    yr = ev.groupby(["cond", "run", "sim_year"])["value_usd"].sum().rename("savings").reset_index()
    aug = mo.groupby(["cond", "run", "sim_year"])["aug_kwh"].sum().rename("aug_kwh").reset_index()
    yr = yr.merge(aug, on=["cond", "run", "sim_year"], how="left").fillna({"aug_kwh": 0.0})
    disc = 1.0 / (1.0 + cfg.discount_rate) ** (yr["sim_year"] + 1)
    yr["npv_part"] = (yr["savings"] - yr["aug_kwh"] * cfg.augment_cost_kwh) * disc
    out = yr.groupby(["cond", "run"]).agg(
        savings_yr=("savings", "mean"), npv=("npv_part", "sum"), aug_kwh=("aug_kwh", "sum"))
    out["success_rate"] = ev.groupby(["cond", "run"])["success"].mean()
    out["annual_peak_hit"] = ev[ev.is_annual].groupby(["cond", "run"])["shaved_kw"].apply(lambda s: (s > 0).mean())
    out["shaved_kw"] = ev.groupby(["cond", "run"])["shaved_kw"].mean()
    out["d_true_kwh"] = ev.groupby(["cond", "run"])["d_true"].mean()
    return out.reset_index()


def ci(x: np.ndarray, n_boot: int = 2000, seed: int = 0) -> tuple[float, float, float]:
    """Mean with bootstrap 95% CI."""
    x = np.asarray(x, float)
    x = x[np.isfinite(x)]
    if x.size == 0:
        return (np.nan, np.nan, np.nan)
    rng = np.random.default_rng(seed)
    b = rng.choice(x, (n_boot, x.size), replace=True).mean(axis=1)
    return float(x.mean()), float(np.percentile(b, 2.5)), float(np.percentile(b, 97.5))


def paired(rl: pd.DataFrame, a: str, b: str, col: str) -> np.ndarray:
    """Paired per-run differences b - a (common random numbers)."""
    pa = rl[rl.cond == a].set_index("run")[col]
    pb = rl[rl.cond == b].set_index("run")[col]
    idx = pa.index.intersection(pb.index)
    return (pb.loc[idx] - pa.loc[idx]).values


def decomposition(rl: pd.DataFrame, col: str = "savings_yr") -> pd.DataFrame:
    """Additive decomposition A -> D (exact by construction):
       rule  = A_opt - A
       V1    = Shapley(hardware)    over {A_opt, B_opt, A_twin, C}
       V2    = Shapley(information) over the same square
       V3    = D - C (active information, net of probe energy)
    """
    runs = sorted(set.intersection(*[set(rl[rl.cond == c].run) for c in
                                      ["A", "A_opt", "B_opt", "A_twin", "C"]]))
    g = {c: rl[rl.cond == c].set_index("run")[col].reindex(runs) for c in rl.cond.unique()}
    parts = {
        "Decision rule (optimized commitment)": g["A_opt"] - g["A"],
        "V1 Physical (bypass)": 0.5 * ((g["B_opt"] - g["A_opt"]) + (g["C"] - g["A_twin"])),
        "V2 Informational (cell twin)": 0.5 * ((g["A_twin"] - g["A_opt"]) + (g["C"] - g["B_opt"])),
    }
    if "D" in g and g["D"].notna().all():
        parts["V3 Active information (VoI probes)"] = g["D"] - g["C"]
    rows = [dict(component=k, mean=ci(v.values)[0], lo=ci(v.values)[1], hi=ci(v.values)[2]) for k, v in parts.items()]
    total = sum(parts.values())
    rows.append(dict(component="Total", mean=ci(total.values)[0], lo=ci(total.values)[1], hi=ci(total.values)[2]))
    return pd.DataFrame(rows)


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float, float]:
    if n == 0:
        return (np.nan, np.nan, np.nan)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return p, c - h, c + h


def coverage(ev: pd.DataFrame) -> pd.DataFrame:
    """Share of events where true deliverable energy fell below the predicted P5 (target 5%)."""
    rows = []
    for cond, g in ev.groupby("cond"):
        k = int((g["d_true"] < g["d_p5"]).sum())
        p, lo, hi = wilson(k, len(g))
        width = float(((g["d_p95"] - g["d_p5"]) / g["d_p50"].clip(lower=1)).mean())
        rows.append(dict(cond=cond, miss_rate=p, lo=lo, hi=hi, n=len(g), rel_width=width))
    return pd.DataFrame(rows)
