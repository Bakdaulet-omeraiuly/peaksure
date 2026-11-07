"""Switch-level checks for REON cell bypass: steady conduction loss (R_on) and the bypass transient.

Two questions, both outside the challenge's required scope ("you do not need to design the switch hardware"),
answered only far enough to test the simulator's assumptions:

1. Conduction loss. Every switchable cell unit carries the full string current through its switch path, so
   switch_loss ~= I_string * R_on / V_cell. We map (R_on, number of parallel strings) to switch_loss and give the
   switch_loss at which REON bypass stops beating a fixed string (break-even), year by year.

2. Transient. The minute-step discharge model treats bypass as instantaneous. Here one cell commutates out of a
   string feeding a DC link with a constant-power inverter (the worst case: negative incremental resistance).
   We integrate the loop current and DC-link voltage through the event and report the dip, overshoot and
   settling time, plus the switching energy, scaled from a measured value.

Evidence:
  commutation time 0.21 us (active -> bypass, positive current) and 0.9 us (bypass -> active): LIT,
    Hanzl et al., IET Power Electron. 14(6):1073-1088 (2021), doi:10.1049/pel2.12088
  switching energy 276 uJ at 125 A (active -> bypass): LIT, same paper; scaled linearly with current here (ASSUMED)
  loop inductance, DC-link capacitance, cell-unit resistance: ASSUMED, swept

Run:  python -m peaksure.switching      (prints tables, writes results/switching.json)
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from scipy.integrate import solve_ivp

from .config import Config

ROOT = Path(__file__).resolve().parents[1]

T_COMMUTATE_OUT_S = 0.21e-6      # LIT (Hanzl 2021)
T_COMMUTATE_IN_S = 0.9e-6        # LIT (Hanzl 2021)
E_SW_REF_J, I_SW_REF_A = 276e-6, 125.0   # LIT (Hanzl 2021), active -> bypass


# ------------------------------------------------------------------ 1. conduction loss
def string_current_a(cfg: Config, n_strings: int | None = None, n_active: int | None = None) -> float:
    """String current at full rated power (A)."""
    s = n_strings or cfg.n_strings
    n = n_active or cfg.n_series
    return cfg.p_max_kw * 1000.0 / s / (cfg.eta_discharge * n * cfg.chem.v_nom)


def switch_loss_from_ron(cfg: Config, r_on_ohm: float, n_strings: int | None = None) -> float:
    """First-order switch loss fraction: I * R_on / V_cell."""
    return string_current_a(cfg, n_strings) * r_on_ohm / cfg.chem.v_nom


def ron_for_switch_loss(cfg: Config, switch_loss: float, n_strings: int | None = None) -> float:
    return switch_loss * cfg.chem.v_nom / string_current_a(cfg, n_strings)


# ------------------------------------------------------------------ 2. transient
@dataclass
class TransientParams:
    n_series: int = 240
    v_cell: float = 3.1
    r_unit_ohm: float = 0.35e-3      # ASSUMED cell unit (parallel group) DC resistance incl. switch
    l_loop_h: float = 5e-6           # ASSUMED string loop inductance
    c_link_f: float = 3e-3           # ASSUMED DC-link capacitance seen by one string
    p_w: float = 312.5e3             # string power (2.5 MW / 8)
    t_c_s: float = T_COMMUTATE_OUT_S
    t_end_s: float = 20e-3


def simulate_bypass(p: TransientParams) -> dict:
    """One cell leaves the path at t = 1 ms. Returns dip, overshoot and settling time."""
    n, vc, r = p.n_series, p.v_cell, p.n_series * p.r_unit_ohm
    t0 = 1e-3

    def v_src(t):
        x = np.clip((t - t0) / p.t_c_s, 0.0, 1.0)
        return (n - x) * vc

    def r_tot(t):
        x = np.clip((t - t0) / p.t_c_s, 0.0, 1.0)
        return r - x * p.r_unit_ohm

    # initial steady state: i = P/v, v = n*vc - r*i
    def steady(vs, rt):
        # v^2 - vs v + rt P = 0, take the high root
        v = 0.5 * (vs + np.sqrt(vs * vs - 4 * rt * p.p_w))
        return p.p_w / v, v

    i0, v0 = steady(n * vc, r)
    i1, v1 = steady((n - 1) * vc, r - p.r_unit_ohm)

    def rhs(t, y):
        i, v = y
        return [(v_src(t) - r_tot(t) * i - v) / p.l_loop_h, (i - p.p_w / v) / p.c_link_f]

    sol = solve_ivp(rhs, (0, p.t_end_s), [i0, v0], method="Radau", max_step=5e-6, rtol=1e-8, atol=1e-9,
                    dense_output=True)
    # resolve the commutation window finely
    tt = np.unique(np.concatenate([np.linspace(0, p.t_end_s, 20001), t0 + np.linspace(0, 20 * p.t_c_s, 401)]))
    i, v = sol.sol(tt)
    after = tt >= t0
    v_dip = (v1 - v[after].min()) / v1           # undershoot below the new steady state
    i_over = (i[after].max() - i1) / i1
    band = 1e-3 * v1
    outside = np.where(after & (np.abs(v - v1) > band))[0]
    settle = (tt[outside[-1]] - t0) if len(outside) else 0.0
    return dict(i0_a=float(i0), i1_a=float(i1), v0_v=float(v0), v1_v=float(v1),
                v_step_pct=float((v0 - v1) / v0 * 100), v_undershoot_pct=float(v_dip * 100),
                i_overshoot_pct=float(i_over * 100), settle_ms=float(settle * 1e3), ok=bool(sol.success))


def breakeven_switch_loss(cfg: Config, duration: str = "2h", seeds=(0, 1, 2)) -> list[dict]:
    """Switch loss at which bypass delivers no more than a fixed string on the SAME cells (25 C, full charge).

    Uses the exported cell populations (web/public/data/life_<dur>_s<seed>.json, bypass tier, each year).
    """
    import base64
    from . import physics as ph
    rows: dict[int, list[float]] = {}
    for seed in seeds:
        f = ROOT / "web" / "public" / "data" / f"life_{duration}_s{seed}.json"
        if not f.exists():
            continue
        life = json.loads(f.read_text())
        for y, st in enumerate(life["tiers"]["bypass"], start=1):
            soh = np.frombuffer(base64.b64decode(st["soh"]), dtype="<u2") / 20000.0
            q = (soh * cfg.q_nom_ah).reshape(cfg.n_strings, cfg.n_series)
            kw = dict(v_nom=cfg.chem.v_nom, n_min=cfg.n_min, chem=cfg.chem, eta=cfg.eta_discharge, switch_loss=0.0)
            e_fix = float(ph.reference_deliverable(q, tier="fixed", **kw))
            e_byp = float(ph.reference_deliverable(q, tier="bypass", **kw))
            rows.setdefault(y, []).append(1 - e_fix / e_byp)
    return [dict(year=y, breakeven_switch_loss_pct=round(100 * float(np.mean(v)), 2)) for y, v in sorted(rows.items())]


def switching_energy_j(i_a: float) -> float:
    return E_SW_REF_J * i_a / I_SW_REF_A


def main() -> dict:
    cfg = Config()
    i8 = string_current_a(cfg)
    ron_grid = [0.1e-3, 0.25e-3, 0.5e-3, 1.0e-3, 2.0e-3]
    strings_grid = [8, 16, 32]
    loss_tbl = [dict(r_on_mohm=r * 1e3, **{f"strings_{s}": round(switch_loss_from_ron(cfg, r, s) * 100, 2)
                                           for s in strings_grid}) for r in ron_grid]
    base = TransientParams(n_series=cfg.n_series, v_cell=cfg.chem.v_nom, p_w=cfg.p_max_kw * 1e3 / cfg.n_strings)
    sweeps = []
    for l_h in (1e-6, 5e-6, 20e-6):
        for c_f in (1e-3, 3e-3, 10e-3):
            pr = TransientParams(**{**asdict(base), "l_loop_h": l_h, "c_link_f": c_f})
            sweeps.append(dict(l_uh=l_h * 1e6, c_mf=c_f * 1e3, **simulate_bypass(pr)))
    n_events = cfg.n_series - cfg.n_min                     # most cells one string can switch out in a discharge
    e_sw = switching_energy_j(i8)
    per_discharge_j = n_events * cfg.n_strings * e_sw
    out = dict(
        string_current_a=i8,
        implied_r_on_mohm_at_base_switch_loss=ron_for_switch_loss(cfg, cfg.switch_loss) * 1e3,
        switch_loss_pct=loss_tbl,
        heat_per_switch_w={f"{r*1e3:g} mOhm": round(i8 ** 2 * r, 1) for r in ron_grid},
        transient=sweeps,
        breakeven_2h=breakeven_switch_loss(cfg, "2h"),
        switching_energy=dict(per_event_j=e_sw, events_per_full_discharge=n_events * cfg.n_strings,
                              per_full_discharge_j=per_discharge_j,
                              share_of_rated_energy=per_discharge_j / (cfg.e_nom_kwh * 3.6e6)),
        evidence=dict(commutation="LIT Hanzl et al. 2021 (0.21 us out, 0.9 us in)",
                      switching_energy="LIT Hanzl et al. 2021, 276 uJ at 125 A; linear current scaling ASSUMED",
                      l_c_r="ASSUMED, swept"),
    )
    (ROOT / "results").mkdir(exist_ok=True)
    (ROOT / "results" / "switching.json").write_text(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    import pandas as pd
    o = main()
    print(f"string current at 2.5 MW, 8 strings: {o['string_current_a']:.0f} A")
    print(f"R_on implied by the base switch_loss: {o['implied_r_on_mohm_at_base_switch_loss']:.3f} mOhm")
    print("switch loss % by R_on and number of strings:")
    print(pd.DataFrame(o["switch_loss_pct"]).to_string(index=False))
    print("heat per switch at 8 strings (W):", o["heat_per_switch_w"])
    print("bypass transient (one cell out at full power):")
    print(pd.DataFrame(o["transient"]).round(4).to_string(index=False))
    print("switching energy:", o["switching_energy"])
    print("break-even switch loss, same cells, 2-h system:")
    print(pd.DataFrame(o["breakeven_2h"]).to_string(index=False))
