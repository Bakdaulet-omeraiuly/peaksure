"""Run the full PeakSure experiment suite and save reproducible results.

    python -m peaksure.experiments            # full (n_runs from config, default 64)
    python -m peaksure.experiments --quick    # 12 runs, for development / CI

Outputs in results/: parquet tables + manifest.json (config hash, git commit, runs, timing).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

from .config import Config
from .sim import simulate

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"

MAIN_CONDS = ["A", "A_opt", "A_twin", "A_perf", "B", "B_opt", "C_raw", "C", "C_perf", "C_T3"]

SENS = {
    "headroom_0.02": dict(headroom=0.02), "headroom_0.05": dict(headroom=0.05),
    "headroom_0.20": dict(headroom=0.20),
    "aging_sigma_low": dict(), "aging_sigma_high": dict(),
    "switch_loss_0.005": dict(switch_loss=0.005), "switch_loss_0.02": dict(switch_loss=0.02),
    "dispatch_low": dict(dispatch_days_summer=2, dispatch_days_other=1),
    "dispatch_high": dict(dispatch_days_summer=10, dispatch_days_other=6),
    "discount_0.05": dict(discount_rate=0.05), "discount_0.10": dict(discount_rate=0.10),
    "hvac_weak": dict(k_hvac=0.7, sigma_t_cell=5.0), "hvac_failing": dict(k_hvac=1.0, sigma_t_cell=6.0),
    "sigma_meas_0.01": dict(sigma_meas=0.01), "sigma_meas_0.04": dict(sigma_meas=0.04),
    "chem_LFP": dict(chemistry="LFP"),
    "duration_1h": dict(e_nom_kwh=2500.0), "duration_3h": dict(e_nom_kwh=7500.0),
    "duration_4h": dict(e_nom_kwh=10000.0),
    # derived from public sources (Addendum AF)
    "switch_loss_0.034": dict(switch_loss=0.034),     # 0.25 mOhm per cell path, 8 strings, ~420 A
    "liquid_cooling": dict(sigma_t_cell=0.6),         # ~2-3 C cell-to-cell range (vendor practice)
    "fault_scenario": dict(),
}



def _job(args):
    cfg_dict, cond, seed, tag, snap = args
    cfg = Config(**cfg_dict)
    out = simulate(cfg, cond, seed, snapshots=snap)
    ev, mo = out["events"].assign(tag=tag), out["monthly"].assign(tag=tag)
    snaps = out.get("snapshots")
    return ev, mo, (cond, seed, snaps) if snap else None


def run_set(jobs, workers):
    evs, mos, snaps = [], [], []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for ev, mo, sn in ex.map(_job, jobs, chunksize=1):
            evs.append(ev)
            mos.append(mo)
            if sn:
                snaps.append(sn)
    return pd.concat(evs, ignore_index=True), pd.concat(mos, ignore_index=True), snaps


def cfgd(cfg: Config) -> dict:
    return asdict(cfg)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--only", choices=["main", "probe", "cal", "sens", "research"], default=None)
    a = ap.parse_args(argv)
    base = Config()
    n_main = 12 if a.quick else base.n_runs
    n_side = 8 if a.quick else 24
    RESULTS.mkdir(exist_ok=True)
    t0 = time.time()
    manifest = dict(config=cfgd(base), config_hash=base.hash(), n_main=n_main, n_side=n_side,
                    started=time.strftime("%Y-%m-%d %H:%M:%S"))
    try:
        manifest["git_commit"] = subprocess.check_output(
            ["git", "-C", str(ROOT), "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        manifest["git_commit"] = "unknown"

    only = a.only
    # 1. main benchmark (+ snapshots for run 0)
    jobs = [(cfgd(base), c, s, "main", s == 0 and c in ("A", "C")) for c in MAIN_CONDS for s in range(n_main)]
    probe_cfg = base.with_(probe_budget=4)
    jobs += [(cfgd(probe_cfg), c, s, "main", False) for c in ["D"] for s in range(n_main)]
    if only in (None, "main"):
        ev, mo, snaps = run_set(jobs, a.workers)
        ev.to_parquet(RESULTS / "events_main.parquet")
        mo.to_parquet(RESULTS / "monthly_main.parquet")
        pd.to_pickle(snaps, RESULTS / "snapshots.pkl")
        print(f"main done {time.time()-t0:.0f}s", flush=True)

    # 2. probing study: policies x budget
    jobs = []
    pbase = base.with_(e_nom_kwh=10000.0)   # 4-h system: where information is decision-relevant
    for b in (1, 2, 4, 8):
        cb = pbase.with_(probe_budget=b)
        jobs += [(cfgd(cb), c, s, f"probe_b{b}", False) for c in ("D", "D_rr", "D_rand") for s in range(n_side)]
    jobs += [(cfgd(pbase), "C", s, "probe_b0", False) for s in range(n_side)]
    # robustness: noisy probes and biased probes
    for name, cb in [("probe_noisy", pbase.with_(probe_budget=4, sigma_probe=0.03)),
                     ("probe_bias", pbase.with_(probe_budget=4, meas_bias=0.03))]:
        jobs += [(cfgd(cb), c, s, name, False) for c in ("D", "D_rr") for s in range(n_side)]
    jobs += [(cfgd(pbase.with_(meas_bias=0.03)), "C", s, "probe_bias_C", False) for s in range(n_side)]
    if only in (None, "probe"):
        ev2, mo2, _ = run_set(jobs, a.workers)
        ev2.to_parquet(RESULTS / "events_probe.parquet")
        mo2.to_parquet(RESULTS / "monthly_probe.parquet")
        print(f"probe done {time.time()-t0:.0f}s", flush=True)

    # 3. calibration / model mismatch
    jobs = []
    for eps in (0.0, 0.1, 0.2, 0.3):
        sysc = base.with_(trend_bias=eps, meas_bias=eps / 10)
        rndc = base.with_(sigma_meas=base.sigma_meas * (1 + 10 * eps))
        for c in ("A_opt", "C_raw", "C"):
            jobs += [(cfgd(sysc), c, s, f"cal_sys_{eps:.1f}", False) for s in range(n_side)]
            jobs += [(cfgd(rndc), c, s, f"cal_rnd_{eps:.1f}", False) for s in range(n_side)]
    if only in (None, "cal"):
        ev3, mo3, _ = run_set(jobs, a.workers)
        ev3.to_parquet(RESULTS / "events_cal.parquet")
        mo3.to_parquet(RESULTS / "monthly_cal.parquet")
        print(f"calibration done {time.time()-t0:.0f}s", flush=True)

    # 4. sensitivity (tornado + thermal + chemistry)
    sens = SENS
    from .config import CHEMISTRIES, NA_ION
    from dataclasses import replace as dc_replace
    jobs = []
    for name, kw in sens.items():
        cfg = base.with_(**kw)
        if name.startswith("aging_sigma") or name == "fault_scenario":
            ch = dc_replace(NA_ION, aging_sigma=0.25 if name.endswith("low") else
                            (0.55 if name.endswith("high") else NA_ION.aging_sigma),
                            fault_hazard_yr=0.002 if name == "fault_scenario" else 0.0)
            CHEMISTRIES[f"Na-ion:{name}"] = ch
            cfg = cfg.with_(chemistry=f"Na-ion:{name}")
        jobs += [(cfgd(cfg), c, s, f"sens_{name}", False)
                 for c in ("A", "A_opt", "A_twin", "B", "B_opt", "C") for s in range(n_side)]
    if only in (None, "sens"):
        ev4, mo4, _ = _run_sens(jobs, a.workers, sens)
        ev4.to_parquet(RESULTS / "events_sens.parquet")
        mo4.to_parquet(RESULTS / "monthly_sens.parquet")
        print(f"sensitivity done {time.time()-t0:.0f}s", flush=True)

    # 5. Paired research extensions. These do not change the established A-D benchmark.
    n_research = 4 if a.quick else 24
    studies = (
        ("mixed", base.with_(initial_age_years=(0.0, 5.0, 10.0)), ("A_opt", "C", "C_T3", "C_LC")),
        ("lifetime", base, ("C", "C_T3", "C_LC")),
        ("guard_null", base, ("C_raw", "C")),
        ("guard_bias", base.with_(trend_bias=0.1, meas_bias=0.01), ("C_raw", "C")),
    )
    jobs = [(cfgd(cfg), cond, seed, tag, False)
            for tag, cfg, conds in studies for cond in conds for seed in range(n_research)]
    if only in (None, "research"):
        ev5, mo5, _ = run_set(jobs, a.workers)
        ev5.to_parquet(RESULTS / "events_research.parquet")
        mo5.to_parquet(RESULTS / "monthly_research.parquet")
        print(f"research done {time.time()-t0:.0f}s", flush=True)

    manifest["seconds"] = round(time.time() - t0, 1)
    manifest["finished"] = time.strftime("%Y-%m-%d %H:%M:%S")
    if only in (None, "research"):
        manifest["research"] = dict(n_runs=n_research, config_hash=base.hash(), finished=manifest["finished"])
    if only:
        old = json.loads((RESULTS / "manifest.json").read_text()) if (RESULTS / "manifest.json").exists() else {}
        old.setdefault("partial_reruns", []).append(dict(part=only, finished=manifest["finished"],
                                                          git_commit=manifest["git_commit"], seconds=manifest["seconds"]))
        if only == "research":
            old["research"] = manifest["research"]
        manifest = old
    (RESULTS / "manifest.json").write_text(json.dumps(manifest, indent=2, default=str))
    print("done", manifest["seconds"], "s")
    return 0


def _sens_job(args):
    cfg_dict, cond, seed, tag, _ = args
    from .config import CHEMISTRIES, NA_ION
    from dataclasses import replace as dc_replace
    chem = cfg_dict["chemistry"]
    if chem.startswith("Na-ion:"):
        name = chem.split(":", 1)[1]
        CHEMISTRIES[chem] = dc_replace(
            NA_ION, aging_sigma=0.25 if name.endswith("low") else (0.55 if name.endswith("high") else NA_ION.aging_sigma),
            fault_hazard_yr=0.002 if name == "fault_scenario" else 0.0)
    out = simulate(Config(**cfg_dict), cond, seed)
    return out["events"].assign(tag=tag), out["monthly"].assign(tag=tag)


def _run_sens(jobs, workers, sens):
    evs, mos = [], []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for ev, mo in ex.map(_sens_job, jobs, chunksize=1):
            evs.append(ev)
            mos.append(mo)
    return pd.concat(evs, ignore_index=True), pd.concat(mos, ignore_index=True), None


if __name__ == "__main__":
    raise SystemExit(main())
