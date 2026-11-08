"""Export exploratory EBS block comparisons to the web app.

Run: python tools/export_ebs.py
"""
from __future__ import annotations

from dataclasses import asdict, replace
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from peaksure import costs  # noqa: E402
from peaksure.ebs import EBSCase, population, simulate  # noqa: E402


def main() -> None:
    base = EBSCase()
    rows = []
    for weak in (1.0, 0.9, 0.8):
        for floor in (280, 300, 330, 350, 750):
            case = replace(base, weak_factor=weak, dc_floor_v=floor)
            q = population(case)
            fixed = simulate(case, q, False)
            bypass = simulate(case, q, True)
            rows.append(dict(weak_factor=weak, dc_floor_v=floor, fixed=fixed, bypass=bypass,
                             extra_kwh=bypass["energy_kwh"] - fixed["energy_kwh"],
                             extra_full_power_min=bypass["full_power_minutes"] - fixed["full_power_minutes"]))
    out = dict(
        title="Exploratory Na+ EBS block model",
        assumptions=asdict(base),
        evidence={
            "blocks": "DERIVED: ceil(2500 kW / 30 kW) = 84 blocks, 2.52 MW / 5.04 MWh; MW-scale interconnection unconfirmed",
            "block_kw": "CONFIRMED: reoncorp.com/hardware EBS line heading '30kW/60kWh' (variant and AC/DC boundary not stated); Na+ assignment DERIVED",
            "block_kwh": "CONFIRMED: same heading, 60 kWh; rated vs usable UNKNOWN; Na+ assignment DERIVED (Li+ claims >2x energy in the same form factor)",
            "cells_per_block": "ASSUMED: 120 cells inferred using 3.1 V and approximately 161 Ah; not an EBS specification",
            "dc_floor_v": "ASSUMED: 280-350 V implies a suitable block DC/DC stage; 750 V direct-input counterexample",
            "n_min": "ASSUMED: 10% of 120 cells may be bypassed before voltage limit",
            "r_on_ohm": "ASSUMED: 0.1 mOhm per active cell switch path; REON value unavailable",
            "weak_factor": "ASSUMED: 1.0 = natural spread only (default view); 0.9 / 0.8 plant one weak cell per block as a labelled stress case, not a prevalence estimate",
            "capacity_cov": "LIT: 1.15% initial spread from TUM Na-ion cells, not REON EBS measurements",
            "eta": "ASSUMED: 96% DC-to-AC efficiency",
            "voltage": "LIT/ASSUMED: representative Na-ion OCV shape with 0.5C linear overpotential; not measured EBS cells",
        },
        economics={
            "required_extra_gross_savings_per_year_usd": costs.team_sheet()["s1"]["needed_extra_gross"],
            "assumed_ebs_price_premium": costs.REON_PREMIUM["central"],
            "assumed_retrofit_cost_per_kwh": costs.RETROFIT_COST["central"],
            "note": "Team-sheet price hurdle, not a simulated EBS annual revenue forecast. A single discharge cannot establish annual ISO-NE peak savings.",
        },
        paxton={
            "sheet": costs.paxton_sheet(),
            "inputs": {key: value for key, (value, _) in costs.PAXTON_INPUTS.items()},
            "compliance_items_unpriced": len(costs.COMPLIANCE_ITEMS),
            "note": "Team workbook sizing and assumed cash flows, not a block-level simulation of a Paxton plant or a vendor quote. Compliance cost placeholders are unknown, not zero-cost requirements.",
        },
        rows=rows,
    )
    path = ROOT / "web/public/data/ebs.json"
    path.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
