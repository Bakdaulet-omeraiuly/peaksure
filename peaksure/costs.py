"""Installed-cost ranges and capex-aware economics.

REON has given no price signal, so every price here is our own assumption built from public
benchmarks. Prices are installed $/kWh for a 2-hour, few-MWh US municipal project (equipment,
engineering, shipping, installation), not cell or pack prices.

Sodium-ion prices are PROVISIONAL placeholders until the team supplies its own figures.

Cost does not change the simulation, so these functions work on saved results without a rerun.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import Config, CONFIRMED, LIT, DERIVED, ASSUMED

SECONDARY = "SECONDARY"   # press or analyst coverage of a primary survey


@dataclass(frozen=True)
class PricePoint:
    name: str
    usd_kwh: float
    scope: str
    chemistry: str
    year: int
    flag: str
    source: str


# Public benchmarks (what each number actually covers differs a lot; never compare without `scope`).
BENCHMARKS = [
    PricePoint("BNEF stationary pack, global", 70, "Pack only", "LFP", 2025, SECONDARY,
               "BNEF battery price survey, Dec 2025, via Energy-Storage.news"),
    PricePoint("BNEF turnkey system, China", 73, "Turnkey system", "LFP", 2025, SECONDARY,
               "BNEF Energy Storage System Cost Survey 2025, via Energy-Storage.news"),
    PricePoint("China tender, LFP system bids", 79, "Turnkey system, 100 MW / 400 MWh", "LFP", 2026, SECONDARY,
               "CNESA tender data (Renqiu), Sep 2026, via press"),
    PricePoint("BNEF turnkey system, global", 117, "Turnkey system", "LFP", 2025, SECONDARY,
               "BNEF Energy Storage System Cost Survey 2025, via Energy-Storage.news"),
    PricePoint("China tender, Na-ion system bids", 153, "Turnkey system, 100 MW / 400 MWh", "Na-ion", 2026, SECONDARY,
               "CNESA tender data (Renqiu), Sep 2026, via press"),
    PricePoint("BNEF turnkey system, Europe", 177, "Turnkey system", "LFP", 2025, SECONDARY,
               "BNEF Energy Storage System Cost Survey 2025, via Energy-Storage.news"),
    PricePoint("US installed, 4-h LFP (estimate)", 185, "Installed, utility scale", "LFP", 2026, SECONDARY,
               "Analyst estimate citing BNEF and Wood Mackenzie (blog-quality)"),
    PricePoint("BNEF turnkey system, US", 219, "Turnkey system, all durations", "LFP", 2025, SECONDARY,
               "BNEF Energy Storage System Cost Survey 2025, via Energy-Storage.news"),
    PricePoint("US C&I installed, large containers", 250, "Installed, >100 kWh (range 180-320)", "LFP", 2025, SECONDARY,
               "Industry and vendor guides (indicative)"),
    PricePoint("Concord MA, equipment", 657, "Battery system only, 2 MW / 4 MWh", "Li-ion", 2024, CONFIRMED,
               "Concord Light Board agenda, 10 Apr 2024 (REON ROI sheet)"),
    PricePoint("Sterling MA, project", 692, "Project total, 2 MW / 3.9 MWh", "Li-ion", 2016, CONFIRMED,
               "Clean Energy Group (REON ROI sheet)"),
    PricePoint("Concord MA, all-in", 846, "Equipment, engineering, shipping, install, insurance", "Li-ion", 2024, CONFIRMED,
               "Concord Light Board agenda, 10 Apr 2024 (REON ROI sheet)"),
]


@dataclass(frozen=True)
class PriceRange:
    """Installed $/kWh for a conventional 2-h, few-MWh US municipal project."""
    low: float
    central: float
    high: float
    flag: str
    note: str

    def as_dict(self) -> dict:
        return {"low": self.low, "central": self.central, "high": self.high}


PRICE_RANGES = {
    "LFP": PriceRange(
        219, 400, 846, ASSUMED,
        "Low = BNEF 2025 US turnkey average; high = Concord 2024 all-in; central = our assumption for a "
        "small municipal project with interconnection and soft costs."),
    "Na-ion": PriceRange(
        219, 435, 921, ASSUMED,
        "PROVISIONAL until the team supplies Na-ion prices. LFP range plus a pack-cost difference of "
        "$0 to +$75/kWh (cells: Wood Mackenzie +$7/kWh vs LFP; China tender: +$74/kWh at system level)."),
}

# Cell-level control premium over the same battery with a conventional BMS (share of installed cost).
# No REON price exists. Relectrify claims ~30% lower electronics cost than a standard BMS (could be
# cheaper); Chalmers reports higher upfront cost for reconfigurable packs. The ROI sheet uses +10%.
REON_PREMIUM = {"low": -0.05, "central": 0.10, "high": 0.20,
                "flag": ASSUMED, "note": "No REON price signal; ROI sheet uses +10%; competitor claims span cheaper to dearer."}

# O&M from the REON ROI sheet, per 5 MWh system, scaled linearly with energy.
OM_USD_YR_PER_5MWH = {"conventional": 60_000.0, "reon": 65_000.0, "flag": ASSUMED, "source": "REON ROI sheet (hypothetical)"}


def annuity(rate: float, years: int) -> float:
    return (1.0 - (1.0 + rate) ** (-years)) / rate


def om_usd_yr(cfg: Config, reon: bool) -> float:
    key = "reon" if reon else "conventional"
    return OM_USD_YR_PER_5MWH[key] * cfg.e_nom_kwh / 5000.0


def is_reon(cond: str) -> bool:
    """Conditions using REON hardware (bypass): B, C, D and their variants. A* = conventional BMS."""
    return not cond.startswith("A")


def breakeven_capex(rl: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    """Per run: the installed $/kWh at which 15-year NPV (savings - augmentation - O&M - capex) is zero.

    `rl` is econ.run_level output; its `npv` column is PV(savings - augmentation) at cfg.discount_rate.
    """
    af = annuity(cfg.discount_rate, cfg.years)
    out = rl[["cond", "run", "npv", "savings_yr"]].copy()
    out["om_pv"] = [om_usd_yr(cfg, is_reon(c)) * af for c in out.cond]
    out["breakeven_kwh"] = (out.npv - out.om_pv) / cfg.e_nom_kwh
    return out


def npv_at_price(rl: pd.DataFrame, cfg: Config, price_kwh: float, premium: float = 0.0) -> pd.DataFrame:
    """Per run: full NPV at an installed conventional price; REON conditions pay (1 + premium)."""
    b = breakeven_capex(rl, cfg)
    capex = np.array([price_kwh * (1.0 + (premium if is_reon(c) else 0.0)) for c in b.cond]) * cfg.e_nom_kwh
    b["capex"] = capex
    b["npv_full"] = b.npv - b.om_pv - capex
    om = np.array([om_usd_yr(cfg, is_reon(c)) for c in b.cond])
    net = b.savings_yr - om
    b["payback_yr"] = np.where(net > 0, capex / net, np.inf)
    return b
