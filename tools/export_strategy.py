"""Export product and chemistry comparisons for the Next.js site from saved runs.

Run after results/ or the team financial inputs change: python tools/export_strategy.py
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from peaksure import costs, curves, econ
from peaksure.config import Config

RESULTS = ROOT / "results"
OUT = ROOT / "web/public/data/strategy.json"


def load(name: str) -> pd.DataFrame:
    return pd.read_parquet(RESULTS / f"{name}.parquet")


def main() -> None:
    cfg = Config(discount_rate=costs.team("discount_rate"))
    main_e, main_m = load("events_main"), load("monthly_main")
    side_e, side_m = load("events_sens"), load("monthly_sens")
    data = {
        "source": json.loads((RESULTS / "manifest.json").read_text()),
        "team": costs.team_sheet(),
        "assumptions": {
            "premium": costs.REON_PREMIUM,
            "retrofit_cost": costs.RETROFIT_COST,
            "discount_rate": cfg.discount_rate,
            "life_years": cfg.years,
            "dc_floor_v": 750,
            "active_cells": cfg.n_series,
            "nominal_mw": cfg.p_max_kw / 1000,
            "nominal_mwh": cfg.e_nom_kwh / 1000,
            "ebs_block_kw": 30,
            "ebs_block_kwh": 60,
        },
        "chemistries": [],
    }
    for name, ev, mo, chem_cfg in [
        ("Na-ion", main_e, main_m, cfg),
        ("LFP", side_e[side_e.tag == "sens_chem_LFP"], side_m[side_m.tag == "sens_chem_LFP"], cfg.with_(chemistry="LFP")),
    ]:
        rl = econ.run_level(ev, mo, chem_cfg)
        price = costs.PRICE_RANGES[name]
        full = costs.npv_at_price(rl, chem_cfg, price.central, costs.REON_PREMIUM["central"])
        retrofit = costs.retrofit_breakeven(ev, mo, chem_cfg, "A_opt", "C", ages=[costs.RETROFIT_DEFAULT_AGE]).iloc[0]
        data["chemistries"].append({
            "name": name,
            "price": price.as_dict(),
            "price_note": price.note,
            "runs": int(rl.run.nunique()),
            "npv_full": {cond: float(full[full.cond == cond].npv_full.mean()) for cond in ("A", "C")},
            "retrofit": {key: float(retrofit[key]) for key in ("age", "remaining_years", "breakeven_kwh", "lo", "hi")},
            "curve": [{"soc": round(i / 20, 2), "v": round(float(curves.terminal_v(name, i / 20, 0.5, False)), 3)} for i in range(21)],
            "floor_min_soc": curves.min_soc_above_floor(name, cfg.n_series, 750, 0.5),
        })
    OUT.write_text(json.dumps(data, indent=2) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
