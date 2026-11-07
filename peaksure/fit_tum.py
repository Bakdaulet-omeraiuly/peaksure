"""Fit the Na-ion ageing parameters to the TUM tables (Bahrke et al., EES Batteries 2026).

Only the published end-of-test table values are used (data/processed/tum_naion_tables.csv); the raw
check-up trajectories at doi:10.14459/2026mp1840745 need a browser download and are not fitted yet.

Model forms are the ones the simulator already uses (peaksure/sim.py, physics.soc_stress):
  calendar loss  = cal_a * arrhenius(T, Ea) * g(SOC, T) * sqrt(t_years)
  g(SOC, T)      = max(0.2, 1 + beta(T) * (SOC - 0.5) + low_pen * [SOC < 0.2]),  beta linear in T (25..45 C)
  cycle loss/EFC = cyc_b * sqrt(DoD / 0.8)

Run:  python -m peaksure.fit_tum            (prints the fit, leave-one-out ranges, writes results/tum_fit.json)
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

from . import physics as ph

ROOT = Path(__file__).resolve().parents[1]
TABLE = ROOT / "data" / "processed" / "tum_naion_tables.csv"


def load() -> pd.DataFrame:
    return pd.read_csv(TABLE, comment="#")


def cal_model(p, t_c, soc, years):
    cal_a, ea, b25, b45 = p
    out = np.empty(len(t_c))
    for i, (t, s, y) in enumerate(zip(t_c, soc, years)):
        g = ph.soc_stress(s, t, b25, b45, 0.0)
        out[i] = cal_a * ph.arrhenius(t, ea) * g * np.sqrt(y)
    return out


def fit_calendar(cal: pd.DataFrame) -> np.ndarray:
    t, s, y = cal.temp_c.values, cal.soc.values, cal.days.values / 365.25
    loss = 1 - cal.soh_pct.values / 100

    def res(p):
        return (cal_model(p, t, s, y) - loss) * 100            # residual in % capacity

    r = least_squares(res, x0=[0.02, 30.0, 1.0, 1.0], bounds=([1e-4, 0.0, -1.5, -1.5], [0.2, 90.0, 3.0, 3.0]))
    return r.x


def cycle_window_years(row) -> float:
    d = row.soc_hi - row.soc_lo
    hours = row.efc / d * (2 * d / row.c_rate + 2 * row.t_cvp_s / 3600.0)
    return hours / 8766.0


def fit_cycle(cyc: pd.DataFrame, p_cal: np.ndarray) -> pd.DataFrame:
    rows = []
    for _, r in cyc.iterrows():
        d = r.soc_hi - r.soc_lo
        yrs = cycle_window_years(r)
        mean_soc = 0.5 * (r.soc_hi + r.soc_lo)
        cal = cal_model(p_cal, [25.0], [mean_soc], [yrs])[0]
        total = 1 - r.soh_pct / 100
        cyc_loss = total - cal
        rows.append(dict(tp=int(r.tp), window=f"{r.soc_lo:.0%}-{r.soc_hi:.0%}", efc=r.efc, years=round(yrs, 2),
                         total_loss=total, calendar_part=cal, cycle_part=cyc_loss,
                         cyc_b=cyc_loss / (r.efc * np.sqrt(d / 0.8)), full_window=d >= 0.99))
    return pd.DataFrame(rows)


def main() -> dict:
    df = load()
    cal_all = df[df.kind == "calendar"]
    clean = cal_all[cal_all.flag.isna()]
    p = fit_calendar(clean)
    loo = np.array([fit_calendar(clean.drop(i)) for i in clean.index])
    pred = cal_model(p, cal_all.temp_c.values, cal_all.soc.values, cal_all.days.values / 365.25)
    cal_tbl = cal_all.assign(loss_pct=(100 - cal_all.soh_pct).round(2), model_pct=(pred * 100).round(2))

    cyc = fit_cycle(df[df.kind == "cycle"], p)
    duty = cyc[cyc.tp.isin([8, 9])]                         # peak duty discharges from ~90-100% SOC downwards
    cyc_b = float(duty.cyc_b.mean())

    out = dict(
        source="Bahrke et al., EES Batteries 2026, 2, 1157-1175, Tables 2/4/5 (end-of-test values only)",
        calendar=dict(cal_a=float(p[0]), ea_kj=float(p[1]), beta_soc_25=float(p[2]), beta_soc_45=float(p[3]),
                      low_soc_penalty=0.0,
                      loo_min=dict(zip(["cal_a", "ea_kj", "beta_soc_25", "beta_soc_45"], loo.min(0).round(4).tolist())),
                      loo_max=dict(zip(["cal_a", "ea_kj", "beta_soc_25", "beta_soc_45"], loo.max(0).round(4).tolist())),
                      excluded=cal_all[cal_all.flag.notna()][["temp_c", "soc", "soh_pct"]].to_dict("records"),
                      table=cal_tbl[["temp_c", "soc", "loss_pct", "model_pct"]].to_dict("records")),
        cycle=dict(cyc_b=cyc_b, basis="mean of TP8 (60-80%) and TP9 (80-100%) after subtracting fitted calendar loss",
                   table=cyc.round(6).to_dict("records")),
    )
    (ROOT / "results").mkdir(exist_ok=True)
    (ROOT / "results" / "tum_fit.json").write_text(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    o = main()
    c = o["calendar"]
    print("calendar fit:", {k: round(c[k], 4) for k in ("cal_a", "ea_kj", "beta_soc_25", "beta_soc_45")})
    print("  leave-one-out min:", c["loo_min"])
    print("  leave-one-out max:", c["loo_max"])
    print(pd.DataFrame(c["table"]).to_string(index=False))
    print("cycle:")
    print(pd.DataFrame(o["cycle"]["table"]).to_string(index=False))
    print("cyc_b (peak duty windows):", f"{o['cycle']['cyc_b']:.2e}")
