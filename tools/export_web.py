"""Export model data for the PeakSure Studio web app (web/public/data).

Lifetime ageing comes from the Python simulator (yearly cell-state snapshots per tier); the browser
runs the intra-day discharge physics, beliefs and the commitment decision live.

    python tools/export_web.py
"""

from __future__ import annotations

import base64
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from peaksure import econ                      # noqa: E402
from peaksure.config import CES_PROFILE, Config, NA_ION, SYSTEM_FLAGS   # noqa: E402
from peaksure.data import HE_GRID, hour_forecast, peak_day_shapes, peak_events  # noqa: E402
from peaksure.sim import draw_population, nominal_fade_month, simulate  # noqa: E402

OUT = ROOT / "web" / "public" / "data"
SEEDS = (0, 1, 2)
DURATIONS = {f"{h}h": Config().p_max_kw * h for h in (1, 2, 3, 4)}
TIERS = {"fixed": "A", "bypass": "C"}


def u16(a: np.ndarray, scale: float) -> str:
    v = np.clip(np.round(np.asarray(a, float) * scale), 0, 65535).astype("<u2")
    return base64.b64encode(v.tobytes()).decode()


def i16(a: np.ndarray, scale: float) -> str:
    v = np.clip(np.round(np.asarray(a, float) * scale), -32768, 32767).astype("<i2")
    return base64.b64encode(v.tobytes()).decode()


def life_job(args):
    dur, e_nom, seed = args
    cfg = Config(e_nom_kwh=e_nom)
    months = tuple(12 * y + 11 for y in range(cfg.years - 1))
    pop = draw_population(cfg, seed)
    out = {"duration": dur, "seed": seed, "tiers": {}}
    for tier, cond in TIERS.items():
        r = simulate(cfg, cond, seed, snapshots=True, snap_months=months)
        snaps = r["snapshots"]
        q0 = pop.q0 / cfg.q_nom_ah
        years = [dict(soh=u16(q0, 20000), twin_mean=u16(q0, 20000),
                      twin_sd=u16(np.full_like(q0, cfg.sigma_meas), 100000), aug_kwh=0.0)]
        for mi in months:
            s = snaps[mi]
            years.append(dict(soh=u16(s["soh"], 20000), twin_mean=u16(s["twin_mean"], 20000),
                              twin_sd=u16(s["twin_sd"], 100000), aug_kwh=float(s["aug_kwh"])))
        out["tiers"][tier] = years
    out["t_off"] = i16(pop.t_off, 100)
    out["r_rel"] = u16(np.exp(cfg.chem.r_cov * pop.z_r), 20000)
    return out


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cfg = Config()
    ch = cfg.chem
    # ---------------- constants for the TS engine
    consts = dict(
        p_max_kw=cfg.p_max_kw, n_strings=cfg.n_strings, n_series=cfg.n_series, headroom=cfg.headroom,
        eta=cfg.eta_discharge, switch_loss=cfg.switch_loss, v_nom=ch.v_nom, cold_slope=ch.cold_slope,
        t_charge_min=ch.t_charge_min, t_derate=ch.t_derate, t_max=ch.t_max, t_hvac_set=cfg.t_hvac_set,
        k_hvac=cfg.k_hvac, sigma_t_cell=cfg.sigma_t_cell, load_heating_c=cfg.load_heating_c,
        forecast_temp_sd=cfg.forecast_temp_sd, sigma_meas=cfg.sigma_meas, sigma_pack_test=cfg.sigma_pack_test,
        sigma_probe=cfg.sigma_probe, alpha=cfg.alpha, eol_retention=cfg.eol_retention, start_year=cfg.start_year,
        rns_2026=cfg.rns_2026, rns_increments=list(cfg.rns_increments), fca_kw_month=cfg.fca_kw_month,
        nominal_fade_month=nominal_fade_month(cfg), years=cfg.years, he_grid=HE_GRID.tolist(),
        durations=DURATIONS, seeds=list(SEEDS), chemistry=ch.name,
        product_profile=CES_PROFILE,
        model_boundary="ASSUMED: interpret the public nameplate energy as nominal cell-side input; modeled deliverable energy includes assumed cell-to-AC efficiency. Published rating boundary UNKNOWN.",
        flags={k: list(v) for k, v in {**SYSTEM_FLAGS, **{f"Na-ion {k}": v for k, v in NA_ION.flags.items()}}.items()},
        towns=econ.TOWNS,
    )
    (OUT / "constants.json").write_text(json.dumps(consts, indent=1))

    # ---------------- real ISO-NE peak events + peak-day shapes + leave-one-year-out hour forecast
    ev = peak_events()
    shp = peak_day_shapes()
    events = []
    for _, r in ev.iterrows():
        day = shp[shp.Date == r.Date].sort_values("Hr_End")
        events.append(dict(
            date=r.Date.strftime("%Y-%m-%d"), year=int(r.year), month=int(r.month), he=int(r.Hr_End),
            t_amb_c=float(r.wcma_dry_bulb_c), is_annual=bool(r.is_annual), system_mw=float(r.system_load_mw),
            load=[float(x) for x in day.System_Load], temp_c=[round((float(x) - 32) * 5 / 9, 1) for x in day.wcma_dry_bulb_f],
            p_hour=[round(float(x), 5) for x in hour_forecast(int(r.month), int(r.year))]))
    (OUT / "events.json").write_text(json.dumps(events))

    # ---------------- lifetime snapshots
    jobs = [(d, e, s) for d, e in DURATIONS.items() for s in SEEDS]
    with ProcessPoolExecutor(max_workers=7) as ex:
        for res in ex.map(life_job, jobs):
            f = OUT / f"life_{res['duration']}_s{res['seed']}.json"
            f.write_text(json.dumps(res))
            print("wrote", f.name, f.stat().st_size // 1024, "KB", flush=True)
    return 0


if __name__ == "__main__" and len(sys.argv) == 1:
    raise SystemExit(main())


def export_fixture():
    """Cross-check fixture: Python physics on the exported year-9 states of life_2h_s0."""
    from peaksure import physics as ph
    cfg = Config()
    life = json.loads((OUT / "life_2h_s0.json").read_text())
    def dec(b):
        return np.frombuffer(base64.b64decode(b), "<u2").astype(float)
    t_off = np.frombuffer(base64.b64decode(life["t_off"]), "<i2").astype(float) / 100
    out = {}
    for tier in ("fixed", "bypass"):
        soh = dec(life["tiers"][tier][8]["soh"]) / 20000
        q = (soh * cfg.q_nom_ah).reshape(cfg.n_strings, cfg.n_series)
        for t_amb in (34.4, -18.3, 20.0):
            t_cell = ph.container_temp(t_amb, cfg.t_hvac_set, cfg.k_hvac) + t_off.reshape(q.shape) + cfg.load_heating_c
            soc0 = np.full_like(q, 1.0)
            e, p = ph.deliverable(q, tier=tier, v_nom=cfg.chem.v_nom, n_min=cfg.n_min, soc0=soc0, t_cell=t_cell,
                                  chem=cfg.chem, eta=cfg.eta_discharge, switch_loss=cfg.switch_loss,
                                  p_string_max=cfg.p_max_kw / cfg.n_strings)
            out[f"{tier}_{t_amb}"] = dict(energy=float(e.sum()), power=float(p.sum()))
    (ROOT / "web" / "src" / "engine" / "__fixtures__").mkdir(parents=True, exist_ok=True)
    (ROOT / "web" / "src" / "engine" / "__fixtures__" / "python_deliverable.json").write_text(json.dumps(out, indent=1))
    print("fixture", out)


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "--fixture":
    export_fixture()
