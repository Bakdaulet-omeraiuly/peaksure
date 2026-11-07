"""Summaries of saved experiment results (everything shown in the demo comes from here)."""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

from peaksure import econ
from peaksure.config import Config
from peaksure.experiments import SENS

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "results"
PERF_OF = {"fixed": "A_perf", "bypass": "C_perf"}
TIER = {"A": "fixed", "A_opt": "fixed", "A_twin": "fixed", "A_perf": "fixed"}


def available() -> bool:
    return (RES / "events_main.parquet").exists()


def manifest() -> dict:
    f = RES / "manifest.json"
    return json.loads(f.read_text()) if f.exists() else {}


def load(name: str) -> pd.DataFrame:
    f = RES / f"{name}.parquet"
    return pd.read_parquet(f) if f.exists() else pd.DataFrame()


def tag_cfg(tag: str) -> Config:
    base = Config()
    if tag.startswith("sens_"):
        kw = dict(SENS.get(tag[5:], {}))
        kw.pop("chemistry", None)
        return base.with_(**kw)
    if tag.startswith("probe"):
        return base.with_(e_nom_kwh=10000.0)
    return base


def paired_ci(rl: pd.DataFrame, a: str, b: str, col: str, scale: float = 1.0):
    d = econ.paired(rl, a, b, col) / scale
    return econ.ci(d)


def psar(ev: pd.DataFrame, cond: str, perf: str) -> float:
    """Peak-Savings-at-Risk ($/yr): mean over years of
    E[savings under perfect information, same hardware] - P5 over runs of realized savings."""
    y = ev.groupby(["cond", "run", "sim_year"])["value_usd"].sum().reset_index()
    a = y[y.cond == cond].groupby("sim_year")["value_usd"].quantile(0.05)
    b = y[y.cond == perf].groupby("sim_year")["value_usd"].mean()
    return float((b - a).mean())


def main_table(ev: pd.DataFrame, mo: pd.DataFrame, cfg: Config, conds=("A", "B", "C", "D", "C_T3")) -> tuple[pd.DataFrame, pd.DataFrame]:
    ev = econ.add_values(ev, cfg)
    rl = econ.run_level(ev, mo, cfg)
    cov = econ.coverage(ev).set_index("cond")
    rows = []
    for c in conds:
        if c not in rl.cond.values:
            continue
        r = rl[rl.cond == c]
        tier = "fixed" if c.startswith("A") else "bypass"
        e = ev[ev.cond == c]
        row = dict(cond=c,
                   savings=econ.ci(r.savings_yr.values), npv=econ.ci(r.npv.values),
                   capture=econ.ci(r.success_rate.values),
                   delivered=econ.ci(e.groupby("run").delivered_full.mean().values),
                   annual=econ.ci(r.annual_peak_hit.values),
                   d_true=econ.ci(r.d_true_kwh.values),
                   aug=econ.ci(r.aug_kwh.values),
                   psar=psar(ev, c, PERF_OF[tier]) if PERF_OF[tier] in ev.cond.values else np.nan,
                   p5miss=cov.loc[c, "miss_rate"] if c in cov.index else np.nan,
                   p5_lo=cov.loc[c, "lo"] if c in cov.index else np.nan,
                   p5_hi=cov.loc[c, "hi"] if c in cov.index else np.nan,
                   width=cov.loc[c, "rel_width"] if c in cov.index else np.nan,
                   premium=paired_ci(rl, "A", c, "npv", cfg.e_nom_kwh) if c != "A" else (0.0, 0.0, 0.0),
                   # same decision rule as the baseline: hardware + information only
                   premium_same=(paired_ci(rl, "A", c, "npv", cfg.e_nom_kwh) if c == "B" else
                                 paired_ci(rl, "A_opt", c, "npv", cfg.e_nom_kwh) if c != "A" and "A_opt" in rl.cond.values
                                 else (0.0, 0.0, 0.0)),
                   n=r.run.nunique())
        rows.append(row)
    return pd.DataFrame(rows), rl


def dref_bands(mo: pd.DataFrame, conds) -> pd.DataFrame:
    d = mo[(mo.cond.isin(conds)) & (mo.month == 12)]
    g = d.groupby(["cond", "sim_year"])["d_ref_kwh"]
    return pd.DataFrame({"p5": g.quantile(0.05), "p50": g.median(), "p95": g.quantile(0.95)}).reset_index()


def sens_summary(ev: pd.DataFrame, mo: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for tag in sorted(ev.tag.unique()):
        cfg = tag_cfg(tag)
        e, m = ev[ev.tag == tag], mo[mo.tag == tag]
        if not {"A", "A_opt", "A_twin", "B", "B_opt", "C"} <= set(e.cond.unique()):
            continue
        rl = econ.run_level(e, m, cfg)
        dec = econ.decomposition(rl).set_index("component")
        prem_c = paired_ci(rl, "A_opt", "C", "npv", cfg.e_nom_kwh)   # same optimized rule
        prem_b = paired_ci(rl, "A", "B", "npv", cfg.e_nom_kwh)
        sav = rl.groupby("cond").savings_yr.mean()
        rows.append(dict(tag=tag[5:], e_nom=cfg.e_nom_kwh,
                         v1=dec.loc["V1 Physical (bypass)", "mean"],
                         v1_lo=dec.loc["V1 Physical (bypass)", "lo"], v1_hi=dec.loc["V1 Physical (bypass)", "hi"],
                         v2=dec.loc["V2 Informational (cell twin)", "mean"],
                         v2_lo=dec.loc["V2 Informational (cell twin)", "lo"], v2_hi=dec.loc["V2 Informational (cell twin)", "hi"],
                         rule=dec.loc["Decision rule (optimized commitment)", "mean"],
                         total=dec.loc["Total", "mean"], total_lo=dec.loc["Total", "lo"], total_hi=dec.loc["Total", "hi"],
                         prem_c=prem_c[0], prem_c_lo=prem_c[1], prem_c_hi=prem_c[2],
                         prem_b=prem_b[0], prem_b_lo=prem_b[1], prem_b_hi=prem_b[2],
                         sav_a=sav.get("A", np.nan), sav_c=sav.get("C", np.nan),
                         tcell_max=float(e[e.cond == "A"].t_cell_max.max())))
    return pd.DataFrame(rows)


def calib_summary(ev: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (tag, cond), g in ev.groupby(["tag", "cond"]):
        mode, eps = tag.split("_")[1], float(tag.split("_")[2])
        k = int((g.d_true < g.d_p5).sum())
        p, lo, hi = econ.wilson(k, len(g))
        over = float((g.d_true > g.d_p95).mean())
        width = float(((g.d_p95 - g.d_p5) / g.d_p50.clip(lower=1)).mean())
        rows.append(dict(mode=mode, eps=eps, cond=cond, miss=p, lo=lo, hi=hi, above95=over, width=width, n=len(g)))
    return pd.DataFrame(rows)


def calib_by_year(ev: pd.DataFrame) -> pd.DataFrame:
    g = ev.assign(miss=ev.d_true < ev.d_p5).groupby(["tag", "cond", "sim_year"])["miss"].mean()
    return g.reset_index()


def probe_summary(ev: pd.DataFrame, mo: pd.DataFrame) -> pd.DataFrame:
    cfg = Config(e_nom_kwh=10000.0)
    rows = []
    for (tag, cond), g in ev.groupby(["tag", "cond"]):
        m = mo[(mo.tag == tag) & (mo.cond == cond)]
        rl = econ.run_level(g, m, cfg)
        s = econ.ci(rl.savings_yr.values)
        mt = re.fullmatch(r"probe_b(\d+)", tag)
        budget = int(mt.group(1)) if mt else None
        rows.append(dict(tag=tag, cond=cond, budget=budget, sav=s[0], sav_lo=s[1], sav_hi=s[2],
                         probes=float(g.probes.mean()),
                         width=float(((g.d_p95 - g.d_p5) / g.d_p50.clip(lower=1)).mean()),
                         miss=float((g.d_true < g.d_p5).mean()), runs=rl.run.nunique()))
    df = pd.DataFrame(rows)
    # paired gains vs C (budget 0) for budgeted rows
    base = ev[(ev.tag == "probe_b0") & (ev.cond == "C")]
    if len(base):
        rlb = econ.run_level(base, mo[(mo.tag == "probe_b0") & (mo.cond == "C")], cfg).set_index("run").savings_yr
        gains = []
        for _, r in df.iterrows():
            g = ev[(ev.tag == r.tag) & (ev.cond == r.cond)]
            rl = econ.run_level(g, mo[(mo.tag == r.tag) & (mo.cond == r.cond)], cfg).set_index("run").savings_yr
            idx = rl.index.intersection(rlb.index)
            gains.append(econ.ci((rl.loc[idx] - rlb.loc[idx]).values) if len(idx) else (np.nan,) * 3)
        df["gain"], df["gain_lo"], df["gain_hi"] = zip(*gains)
    return df
