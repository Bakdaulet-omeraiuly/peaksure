"""Installed-cost ranges and capex-aware economics.

REON has given no price signal, so every price here is our own assumption built from public
benchmarks. Prices are installed $/kWh for a 2-hour, few-MWh US municipal project (equipment,
engineering, shipping, installation), not cell or pack prices.

Central prices, premiums, O&M and retrofit inputs come from the team financial model (TEAM_INPUTS); Na-ion = LFP x 1.145.

Cost does not change the simulation, so these functions work on saved results without a rerun.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import Config, CONFIRMED, LIT, DERIVED, ASSUMED

SECONDARY = "SECONDARY"   # press or analyst coverage of a primary survey
TEAM = "TEAM"             # team financial model (PeakSure_REON_One_Sheet_Financial_Model_With_Sources.xlsx)

# Inputs from the team's one-sheet financial model (Nov 2026). IDs match its evidence register.
# Savings inputs (A3, A4, A9, A13) are the sheet's assumptions; the simulator computes its own savings,
# and the app shows both side by side.
TEAM_INPUTS = {
    "global_2h_capex_kwh": (325.0, "S1", "Modo Energy global battery capex survey, 9 Sep 2026: median global 2-h capex"),
    "us_premium": (0.15, "S1", "Modo Energy: US about 15% above the global 2-h median"),
    "full_system_premium": (0.10, "A1", "REON full-system premium vs conventional; hypothetical, no REON quote"),
    "sodium_premium": (0.145, "A2", "Sodium-ion premium on all-in capex; illustrative, not verified"),
    "conv_gross_savings_yr": (400_000.0, "A3", "Conventional gross savings; no tariff or dispatch analysis"),
    "reon_savings_uplift": (0.10, "A4", "REON incremental gross savings; unproven"),
    "om_conv_yr": (60_000.0, "A5", "Conventional O&M; no supplier pricing"),
    "om_reon_yr": (65_000.0, "A5", "REON O&M; no supplier pricing"),
    "life_years": (15, "A6", "Evaluation period, not a warranty"),
    "discount_rate": (0.08, "A7", "Not a quoted financing rate"),
    "retrofit_capex": (250_000.0, "A8", "BMS-only retrofit integration capex for 5 MWh; feasibility and price unverified"),
    "retrofit_gross_savings_yr": (55_000.0, "A9", "Retrofit incremental gross savings vs do-nothing; not measured"),
    "retrofit_om_yr": (7_000.0, "A10", "Retrofit incremental O&M"),
    "retrofit_years": (10, "A11", "Remaining benefit horizon after retrofit"),
    "replacement_capex": (600_000.0, "A12", "Conventional module replacement (partial), comparator to retrofit"),
    "replacement_gross_savings_yr": (70_000.0, "A13", "Replacement incremental gross savings vs do-nothing"),
    "replacement_om_yr": (5_000.0, "A14", "Replacement incremental O&M"),
}


def team(key: str):
    return TEAM_INPUTS[key][0]


TEAM_CONV_CAPEX_KWH = team("global_2h_capex_kwh") * (1.0 + team("us_premium"))   # US-adjusted 2-h capex


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
    PricePoint("Modo 2-h capex, global median", 325, "All-in 2-h capex", "LFP", 2026, SECONDARY,
               "Modo Energy global battery capex survey, Sep 2026 (team sheet S1)"),
    PricePoint("Modo 2-h capex, US-adjusted (+15%)", 374, "All-in 2-h capex, our US adjustment", "LFP", 2026, TEAM,
               "Team sheet: Modo global median x 1.15"),
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
        219, round(TEAM_CONV_CAPEX_KWH, 2), 846, ASSUMED,
        "Central: team sheet, Modo 2026 global 2-h median $325/kWh x 1.15 US premium. Low: BNEF 2025 US turnkey "
        "average (narrower scope). High: Concord 2024 all-in."),
    "Na-ion": PriceRange(
        round(219 * (1 + team("sodium_premium")), 2), round(TEAM_CONV_CAPEX_KWH * (1 + team("sodium_premium")), 2),
        round(846 * (1 + team("sodium_premium")), 2), ASSUMED,
        "LFP range x 1.145: the team sheet's 14.5% sodium-ion premium (illustrative, not verified; China tender "
        "bids show a larger gap, cell prices a smaller one)."),
}

# Cell-level control premium over the same battery with a conventional BMS (share of installed cost).
# No REON price exists. Relectrify claims ~30% lower electronics cost than a standard BMS (could be
# cheaper); Chalmers reports higher upfront cost for reconfigurable packs. The ROI sheet uses +10%.
REON_PREMIUM = {"low": -0.05, "central": team("full_system_premium"), "high": 0.20,
                "flag": ASSUMED, "note": "No REON price signal; team sheet uses +10% (A1); competitor claims span cheaper to dearer."}

# O&M from the REON ROI sheet, per 5 MWh system, scaled linearly with energy.
OM_USD_YR_PER_5MWH = {"conventional": team("om_conv_yr"), "reon": team("om_reon_yr"), "flag": ASSUMED,
                      "source": "Team sheet A5 (illustrative)"}


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


# ---------------------------------------------------------------- product 2: BMS-only retrofit
# REON offers two products:
#   1. Full system: a new battery with REON's cell-level control BMS (EBS). Compared with a new
#      conventional battery; the customer pays the battery price plus any premium (functions above).
#   2. BMS-only retrofit: REON's cell-level control applied to a battery the customer already owns.
#      No battery cost; the customer pays only for the technology and its installation, and gains the
#      difference in value between the retrofitted and the unchanged battery over its remaining life.
#
# No public price exists for a cell-level BMS retrofit. The range below is an assumption: BMS hardware
# is a small share of rack cost (vendor sources, roughly $0-45/kWh, unverified), and a retrofit adds
# per-cell switch installation labour. The key model output is the BREAK-EVEN retrofit price.
RETROFIT_COST = {"low": team("retrofit_capex") / 5000.0 * 0.5, "central": team("retrofit_capex") / 5000.0,
                 "high": team("retrofit_capex") / 5000.0 * 1.5, "flag": ASSUMED,
                 "note": "Central: team sheet A8, $250k for 5 MWh. Low/high: +/-50% (our assumption). No public price "
                         "for a cell-level BMS retrofit; third-party compatibility, warranty and safety are unverified."}
# Extra O&M of the retrofitted battery vs the unchanged one, per 5 MWh ($/yr): team sheet A10.
RETROFIT_OM_DELTA_PER_5MWH = team("retrofit_om_yr")
RETROFIT_DEFAULT_AGE = team("life_years") - team("retrofit_years")   # 10 years left = retrofit at year 5

# Value comparisons (same decision rule, so the rule effect is never credited to REON hardware)
RETROFIT_PAIRS = {
    "Hardware only (bypass)": ("A", "B"),
    "Hardware + cell twin (PeakSure)": ("A_opt", "C"),
}


def yearly_net(ev: pd.DataFrame, mo: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    """Per (cond, run, sim_year): peak savings minus augmentation spend ($)."""
    from .econ import add_values
    e = add_values(ev, cfg)
    yr = e.groupby(["cond", "run", "sim_year"])["value_usd"].sum().rename("savings").reset_index()
    aug = mo.groupby(["cond", "run", "sim_year"])["aug_kwh"].sum().rename("aug_kwh").reset_index()
    yr = yr.merge(aug, on=["cond", "run", "sim_year"], how="left").fillna({"aug_kwh": 0.0})
    yr["net"] = yr.savings - yr.aug_kwh * cfg.augment_cost_kwh
    return yr


def retrofit_breakeven(ev: pd.DataFrame, mo: pd.DataFrame, cfg: Config, base: str, new: str,
                       ages=None, om_delta_per_5mwh: float | None = None) -> pd.DataFrame:
    """Break-even retrofit price ($/kWh of battery) when the retrofit is installed at battery age k.

    Per run: PV at year k of (net_new - net_base) over the remaining years, minus PV of the extra O&M,
    divided by the battery's nominal kWh. Positive = the retrofit can cost up to this much and still pay.

    Approximation: the retrofitted battery is represented by the `new` condition's path from year 0, so
    cell ageing before the retrofit follows `new`, and its twin has the full history. Both make retrofits
    at older ages slightly optimistic.
    """
    from .econ import ci
    om = (RETROFIT_OM_DELTA_PER_5MWH if om_delta_per_5mwh is None else om_delta_per_5mwh) * cfg.e_nom_kwh / 5000.0
    yr = yearly_net(ev[ev.cond.isin([base, new])], mo[mo.cond.isin([base, new])], cfg)
    piv = yr.pivot_table(index=["run", "sim_year"], columns="cond", values="net").dropna()
    diff = (piv[new] - piv[base]).rename("d").reset_index()
    n_years = int(diff.sim_year.max()) + 1
    ages = range(n_years) if ages is None else ages
    rows = []
    for k in ages:
        d = diff[diff.sim_year >= k]
        pv = (d.d / (1.0 + cfg.discount_rate) ** (d.sim_year - k + 1)).groupby(d.run).sum()
        per_kwh = (pv - om * annuity(cfg.discount_rate, n_years - k)) / cfg.e_nom_kwh
        m, lo, hi = ci(per_kwh.values)
        rows.append(dict(age=k, remaining_years=n_years - k, breakeven_kwh=m, lo=lo, hi=hi, runs=len(per_kwh)))
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- the team sheet's own arithmetic
def team_sheet() -> dict:
    """Recompute the team sheet's scenarios from its inputs (assumed savings, not simulated)."""
    r, n = team("discount_rate"), team("life_years")
    e = 5000.0
    conv_capex = TEAM_CONV_CAPEX_KWH * e
    reon_capex = conv_capex * (1 + team("full_system_premium"))
    conv_net = team("conv_gross_savings_yr") - team("om_conv_yr")
    reon_gross = team("conv_gross_savings_yr") * (1 + team("reon_savings_uplift"))
    reon_net = reon_gross - team("om_reon_yr")
    af = annuity(r, n)
    s1 = dict(conv_capex=conv_capex, reon_capex=reon_capex, conv_gross=team("conv_gross_savings_yr"),
              reon_gross=reon_gross, conv_npv=-conv_capex + conv_net * af, reon_npv=-reon_capex + reon_net * af,
              conv_payback=conv_capex / conv_net, reon_payback=reon_capex / reon_net,
              needed_extra_gross=(reon_capex - conv_capex) / af + (team("om_reon_yr") - team("om_conv_yr")))
    s1["incr_npv"] = s1["reon_npv"] - s1["conv_npv"]
    m = team("retrofit_years")
    af2 = annuity(r, m)
    rf_net = team("retrofit_gross_savings_yr") - team("retrofit_om_yr")
    rp_net = team("replacement_gross_savings_yr") - team("replacement_om_yr")
    s2 = dict(retrofit_capex=team("retrofit_capex"), retrofit_gross=team("retrofit_gross_savings_yr"),
              retrofit_npv=-team("retrofit_capex") + rf_net * af2, retrofit_payback=team("retrofit_capex") / rf_net,
              retrofit_max_capex=rf_net * af2,
              replacement_capex=team("replacement_capex"), replacement_gross=team("replacement_gross_savings_yr"),
              replacement_npv=-team("replacement_capex") + rp_net * af2,
              replacement_payback=team("replacement_capex") / rp_net)
    return dict(s1=s1, s2=s2)


def retrofit_gross_by_age(ev: pd.DataFrame, mo: pd.DataFrame, cfg: Config, base: str, new: str, age: int) -> tuple:
    """Simulated extra net savings per year (peak savings + avoided augmentation) after a retrofit at `age`."""
    from .econ import ci
    yr = yearly_net(ev[ev.cond.isin([base, new])], mo[mo.cond.isin([base, new])], cfg)
    piv = yr.pivot_table(index=["run", "sim_year"], columns="cond", values="net").dropna()
    d = (piv[new] - piv[base]).rename("d").reset_index()
    return ci(d[d.sim_year >= age].groupby("run").d.mean().values)
