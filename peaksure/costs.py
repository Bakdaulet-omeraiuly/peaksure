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


# ---------------------------------------------------------------- strategy and Phase 1 candidates
# Phase 1: BMS-only retrofit on batteries towns already own. Proves the technology at low cost.
# Phase 2: once field evidence exists, sell new batteries built with REON's cell control (EBS blocks).
ASSESS_YEAR = 2026

# Massachusetts municipal batteries that are retrofit candidates. `scenario` names the closest simulated
# case in the app's retrofit chart (duration and chemistry are approximate matches, not simulations of
# these batteries). Value is scaled per kWh of battery.
TOWN_BATTERIES = {
    "Sterling": dict(mw=2.0, mwh=3.9, year=2016, scenario="2-h, LFP",
                     src="Clean Energy Group; Sandia/ESTAP 2018 (Li-ion, NEC Energy Solutions)"),
    "Reading": dict(mw=5.0, mwh=10.0, year=2019, scenario="2-h, LFP",
                    src="Reading MLD; MMWEC (Li-ion, NextEra)"),
    "Holden": dict(mw=5.0, mwh=22.0, year=2024, scenario="4-h system",
                   src="Lightshift / MMWEC 2024 (owned by Delorean)"),
}


def town_retrofit_table(rf: pd.DataFrame, life_years: int, price_kwh: float) -> pd.DataFrame:
    """Phase 1 candidates: break-even retrofit price at each battery's current age, scaled to its size.

    `rf` is the stacked output of retrofit_breakeven with a `scenario` column (as built in the app).
    """
    rows = []
    for town, b in TOWN_BATTERIES.items():
        age = min(ASSESS_YEAR - b["year"], life_years - 1)
        g = rf[(rf.scenario == b["scenario"]) & (rf.age == age)]
        if g.empty:
            continue
        r = g.iloc[0]
        kwh = b["mwh"] * 1000.0
        rows.append(dict(town=town, battery=f"{b['mw']:g} MW / {b['mwh']:g} MWh", hours=b["mwh"] / b["mw"],
                         age=age, years_left=life_years - age, scenario=b["scenario"],
                         breakeven_kwh=r.breakeven_kwh, lo=r.lo, hi=r.hi,
                         max_cost=r.breakeven_kwh * kwh, retrofit_cost=price_kwh * kwh,
                         npv=(r.breakeven_kwh - price_kwh) * kwh, src=b["src"]))
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- Massachusetts case, licensing, compliance
# From PeakSure_REON_Paxton_With_MA_Compliance.xlsx (team, Nov 2026). Illustrative; not REON quotes and
# not verified Paxton cash flows.
PAXTON_INPUTS = {
    "power_kw": (3000.0, "Paxton reference: 3 MW"),
    "hours": (3.0, "Paxton reference: 9 MWh / 3 MW"),
    "unit_kw": (30.0, "Provisional REON EBS spec; verify exact variant"),
    "unit_kwh": (60.0, "Provisional REON EBS spec; verify exact variant"),
    "usable_fraction": (0.9, "Assumption; discharge limits, not a verified datasheet"),
    "additional_costs": (250_000.0, "Placeholder project costs; exclude costs already in the turnkey benchmark"),
    "life_years": (20, "Illustrative; replacements and degradation not modelled in the sheet"),
    "discount_rate": (0.08, "Illustrative"),
    "gross_savings_yr": (500_000.0, "ILLUSTRATIVE: $10M / 20 yr Paxton lifetime savings claim; not verified"),
    "om_reserve_yr": (0.0, "Placeholder = 0; must be estimated before an investment decision"),
}
PAXTON_PRICE_POINTS = (300.0, None, 500.0, 850.0)   # None = US-adjusted Modo benchmark

# Phase 1 as a licence: REON sells its cell-control technology per MW to battery owners/partners.
LICENSING_INPUTS = {
    "portfolio_mw": (5.0, "Assumption"),
    "upfront_fee_per_mw": (100_000.0, "Hypothetical contract term"),
    "annual_license_per_mw": (12_000.0, "Hypothetical contract term"),
    "implementation_cost": (175_000.0, "Hypothetical REON cost"),
    "annual_recurring_cost": (15_000.0, "Hypothetical REON cost"),
    "contract_years": (10, "Assumption"),
}

# Massachusetts market entry & compliance. All costs are UNKNOWN placeholders (0 = not yet priced,
# not a verified zero). Columns: EBS upfront, EBS annual, licensing upfront, licensing annual.
COMPLIANCE_ITEMS = [
    ("Business role & contracting", "Vendor vs owner/operator; municipal RFP, site agreements, IP and SLA"),
    ("Siting / local permits", "MA 225 CMR 29.00 applicability and effective dates; local siting and land-use review"),
    ("Pre-filing / community engagement", "Site selection, community consultation, local filing where required"),
    ("Fire code & AHJ", "527 CMR 1.00; local fire department; NFPA 855 where adopted; fire-response plan"),
    ("UL 9540 / UL 9540A evidence", "NRTL system listing and thermal-runaway test documentation; a retrofit may invalidate the listing"),
    ("Electrical design / inspections", "527 CMR 12.00; licensed installer, inspection and commissioning"),
    ("Utility interconnection", "Host municipal utility approval; no grid export assumed until approved"),
    ("ISO-NE wholesale registration", "Only if participating in wholesale markets"),
    ("Environmental & site studies", "Wetlands, stormwater, noise and land-use screening as applicable"),
    ("Battery waste / decommissioning", "310 CMR 30.000; waste handlers, recycling and end-of-life plan"),
    ("Clean Peak eligibility assessment", "MA Clean Peak eligibility; no incentive revenue booked"),
    ("Cybersecurity / utility integration", "SCADA, telemetry, dispatch, cybersecurity, utility data-sharing"),
    ("Third-party retrofit feasibility", "Licensing: OEM permission, compatibility, warranty, recertification, insurer approval"),
]
COMPLIANCE_COLUMNS = ("ebs_upfront", "ebs_annual", "license_upfront", "license_annual")


def compliance_frame() -> pd.DataFrame:
    """Editable compliance table with zero placeholders."""
    return pd.DataFrame([dict(requirement=r, authority=a, **{c: 0.0 for c in COMPLIANCE_COLUMNS})
                         for r, a in COMPLIANCE_ITEMS])


def _totals(compliance: pd.DataFrame | None) -> dict:
    if compliance is None or compliance.empty:
        return {c: 0.0 for c in COMPLIANCE_COLUMNS}
    return {c: float(pd.to_numeric(compliance[c], errors="coerce").fillna(0.0).sum()) for c in COMPLIANCE_COLUMNS}


def paxton(key: str):
    return PAXTON_INPUTS[key][0]


def licensing(key: str):
    return LICENSING_INPUTS[key][0]


def ebs_sizing(power_kw: float, hours: float, unit_kw: float, unit_kwh: float, usable: float) -> dict:
    """EBS units needed for a power and duration target (sheet logic: max of power- and energy-limited counts)."""
    import math
    energy = power_kw * hours
    n_power = math.ceil(power_kw / unit_kw)
    n_energy = math.ceil(energy / (unit_kwh * usable))
    n = max(n_power, n_energy)
    return dict(energy_kwh=energy, units_power=n_power, units_energy=n_energy, units=n,
                nominal_kwh=n * unit_kwh, power_kw_installed=n * unit_kw, usable_kwh=n * unit_kwh * usable)


def paxton_sheet(compliance: pd.DataFrame | None = None, gross_savings_yr: float | None = None,
                 price_kwh: float | None = None) -> dict:
    """Recompute the Paxton-sized EBS case from its inputs. `gross_savings_yr` overrides the sheet's assumption."""
    t = _totals(compliance)
    sz = ebs_sizing(paxton("power_kw"), paxton("hours"), paxton("unit_kw"), paxton("unit_kwh"), paxton("usable_fraction"))
    price = TEAM_CONV_CAPEX_KWH if price_kwh is None else price_kwh
    battery_capex = sz["nominal_kwh"] * price
    capex = battery_capex + paxton("additional_costs") + t["ebs_upfront"]
    gross = paxton("gross_savings_yr") if gross_savings_yr is None else gross_savings_yr
    net = gross - paxton("om_reserve_yr") - t["ebs_annual"]
    af = annuity(paxton("discount_rate"), paxton("life_years"))
    breakeven = capex / af
    return dict(**sz, price_kwh=price, battery_capex=battery_capex, capex=capex, gross=gross, net=net, annuity=af,
                npv=net * af - capex, payback=capex / net if net > 0 else float("inf"),
                breakeven_net=breakeven, margin=net - breakeven)


def licensing_sheet(compliance: pd.DataFrame | None = None) -> dict:
    """REON's view of Phase 1 licensing (sheet logic)."""
    t = _totals(compliance)
    mw = licensing("portfolio_mw")
    upfront_rev = mw * licensing("upfront_fee_per_mw")
    upfront_net = upfront_rev - licensing("implementation_cost") - t["license_upfront"]
    annual_net = mw * licensing("annual_license_per_mw") - licensing("annual_recurring_cost") - t["license_annual"]
    npv = upfront_net + annual_net * annuity(paxton("discount_rate"), licensing("contract_years"))
    return dict(portfolio_mw=mw, upfront_revenue=upfront_rev, upfront_net=upfront_net, annual_net=annual_net, npv=npv)


def licensee_value(ev: pd.DataFrame, mo: pd.DataFrame, cfg: Config, base: str = "A_opt", new: str = "C") -> dict:
    """Customer side of a licence on one battery: simulated value of cell control vs licence fees.

    The licence starts with `contract_years` of battery life left. Annual licence fees are treated like
    extra O&M in retrofit_breakeven; NPV = PV(extra savings - annual fee) - upfront fee.
    """
    mw = cfg.p_max_kw / 1000.0
    years = licensing("contract_years")
    age = max(0, cfg.years - years)
    annual_fee = licensing("annual_license_per_mw") * mw
    upfront_fee = licensing("upfront_fee_per_mw") * mw
    be = retrofit_breakeven(ev, mo, cfg, base, new, ages=[age],
                            om_delta_per_5mwh=annual_fee * 5000.0 / cfg.e_nom_kwh).iloc[0]
    gross = retrofit_gross_by_age(ev, mo, cfg, base, new, age)
    return dict(mw=mw, age=age, years=years, upfront_fee=upfront_fee, annual_fee=annual_fee,
                extra_savings_yr=gross[0], extra_savings_lo=gross[1], extra_savings_hi=gross[2],
                npv=be.breakeven_kwh * cfg.e_nom_kwh - upfront_fee,
                npv_lo=be.lo * cfg.e_nom_kwh - upfront_fee, npv_hi=be.hi * cfg.e_nom_kwh - upfront_fee)
