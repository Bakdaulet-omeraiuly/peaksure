"""PeakSure configuration: every parameter carries a value and an evidence flag.

Flags
  CONFIRMED  - from an original source (REON material, ISO-NE, MMWEC)
  LIT        - peer-reviewed or primary literature
  DERIVED    - computed from data we processed
  ASSUMED    - modelling assumption; must appear in sensitivity / assumptions panel
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace, asdict
import hashlib
import json

CONFIRMED, LIT, DERIVED, ASSUMED = "CONFIRMED", "LIT", "DERIVED", "ASSUMED"


@dataclass(frozen=True)
class Chemistry:
    name: str
    v_nom: float                 # V per cell, nominal
    cap_cov: float               # initial capacity coefficient of variation
    r_cov: float                 # initial DC resistance coefficient of variation
    aging_sigma: float           # lognormal sigma of per-cell ageing-rate multiplier
    rho_r_aging: float           # corr(initial resistance, ageing multiplier)
    cal_a: float                 # calendar fade, fraction per sqrt(year) at 25 C, 50% SOC
    cyc_b: float                 # cycle fade, fraction per equivalent full cycle (EFC) at 80% DoD
    ea_kj: float                 # Arrhenius activation energy for calendar fade, kJ/mol
    beta_soc_25: float           # calendar SOC sensitivity at 25 C (g = 1 + beta*(soc-0.5))
    beta_soc_45: float           # calendar SOC sensitivity at 45 C
    low_soc_penalty: float       # extra calendar stress below 20% SOC (Na-ion anode LAM)
    cold_slope: float            # capacity loss per degC below 25 C at discharge
    t_charge_min: float          # degC, minimum charging temperature
    t_derate: float              # degC, cell temperature where current derating starts
    t_max: float                 # degC, absolute discharge limit
    fault_hazard_yr: float       # per-cell per-year hazard of a plating/short fault (base case 0)
    flags: dict = field(default_factory=dict)


NA_ION = Chemistry(
    name="Sodium-ion (layered oxide / hard carbon)",
    v_nom=3.1, cap_cov=0.0115, r_cov=0.11, aging_sigma=0.40, rho_r_aging=0.6,
    # ageing fitted to TUM Tables 4-5 by peaksure/fit_tum.py (results/tum_fit.json); previous ASSUMED values:
    # cal_a=0.030, cyc_b=1.0e-4, ea_kj=35, beta_soc_25=0.10, beta_soc_45=0.90, low_soc_penalty=0.30
    cal_a=0.014, cyc_b=2.1e-5, ea_kj=28.4, beta_soc_25=2.0, beta_soc_45=1.79,
    low_soc_penalty=0.0, cold_slope=0.0067, t_charge_min=0.0, t_derate=45.0, t_max=60.0,
    fault_hazard_yr=0.0,
    flags={
        "cap_cov": (LIT, "Bahrke et al., EES Batteries 2026: capacity CoV 1.15% (94 cells)"),
        "r_cov": (LIT, "Bahrke et al. 2026: R_DC CoV 10.4-11.9%"),
        "aging_sigma": (ASSUMED, "Calibrated to the TUM within-test-point spread (3.1% vs 23.4% loss); sensitivity"),
        "rho_r_aging": (ASSUMED, "TUM: R_DC vs coulombic efficiency r = -0.675; used as a proxy"),
        "cal_a": (DERIVED, "Fit to TUM Table 5 (630 d storage, 6 clean points); leave-one-out 0.011-0.016"),
        "ea_kj": (DERIVED, "Fit to TUM 25 vs 45 C only; leave-one-out 24-37 kJ/mol; authors: two temperatures are not enough"),
        "cyc_b": (DERIVED, "TUM TP8/TP9 (60-100% SOC windows, ~4300 EFC) minus fitted calendar loss; full 0-100% windows fade >10x faster"),
        "beta_soc": (DERIVED, "Fit to TUM Table 5; 25 C value poorly identified (leave-one-out 1.7 to bound 3.0); 25 C 50/70% SOC cells excluded (plating per authors)"),
        "low_soc_penalty": (DERIVED, "Set 0: TUM capacity loss is lowest at 10% SOC (anode LAM highest but not capacity-limiting)"),
        "cold_slope": (LIT, "Leeds, Appl. Energy 2026: 51-62% capacity at -40 C (linearised)"),
        "t_charge_min": (ASSUMED, "Vendor Na-ion datasheet: charge 0-40 C (not REON)"),
        "t_derate": (ASSUMED, "Vendor datasheet discharge limit 60 C; derate onset assumed 45 C"),
        "fault_hazard_yr": (ASSUMED, "Base case 0; scenario only (TUM observed plating in lab cycling)"),
    },
)

LFP = Chemistry(
    name="LFP (LiFePO4 / graphite)",
    v_nom=3.2, cap_cov=0.004, r_cov=0.025, aging_sigma=0.25, rho_r_aging=0.3,
    cal_a=0.025, cyc_b=8.0e-5, ea_kj=40.0, beta_soc_25=0.6, beta_soc_45=1.0,
    low_soc_penalty=0.0, cold_slope=0.0040, t_charge_min=0.0, t_derate=45.0, t_max=55.0,
    fault_hazard_yr=0.0,
    flags={
        "cap_cov": (LIT, "Pristine-cell screening, capacity RSD < 0.4% (200+ cells)"),
        "r_cov": (LIT, "Pristine-cell screening, resistance RSD ~2.5%"),
        "aging_sigma": (ASSUMED, "Lower spread than Na-ion; sensitivity"),
        "cal_a": (ASSUMED, "Order of magnitude; fit to Naumann 2018 pending"),
        "cyc_b": (ASSUMED, "Order of magnitude"),
        "beta_soc": (LIT, "Naumann 2018: calendar fade rises with SOC and temperature (qualitative)"),
        "cold_slope": (ASSUMED, "Typical LFP low-temperature capacity loss"),
    },
)

CHEMISTRIES = {"Na-ion": NA_ION, "LFP": LFP}


@dataclass(frozen=True)
class Config:
    # --- system (REON CES) ---
    chemistry: str = "Na-ion"
    p_max_kw: float = 2500.0          # CONFIRMED (REON_WHO_WE_ARE.pdf)
    e_nom_kwh: float = 5000.0         # CONFIRMED ("up to 5 MWh")
    n_strings: int = 8                # ASSUMED
    n_series: int = 240               # ASSUMED (switchable cell units per string)
    headroom: float = 0.10            # ASSUMED: share of series cells above N_min (DC window)
    eta_discharge: float = 0.96       # ASSUMED
    switch_loss: float = 0.01         # ASSUMED (0.5-2% sensitivity)
    # --- operation ---
    years: int = 15
    start_year: int = 2027
    dispatch_days_summer: int = 5     # ASSUMED candidate-peak dispatch days per month (Jun-Sep)
    dispatch_days_other: int = 3      # ASSUMED
    rest_soc: float = 0.90            # ASSUMED standby SOC
    tier3_weak_share: float = 0.25    # Tier 3: share of cells (weakest by twin) rested low
    tier3_rest_soc: float = 0.35
    initial_age_years: tuple = (0.0,)  # ASSUMED retrospective calendar ages; same chemistry
    guard_threshold: float = 0.015    # ASSUMED one-sided smoothed pack-test discrepancy
    eol_retention: float = 0.70       # brief: stationary threshold 70%
    # --- thermal ---
    t_hvac_set: float = 23.0          # ASSUMED container setpoint, degC
    k_hvac: float = 0.25              # ASSUMED: container temp follows ambient by this fraction
    sigma_t_cell: float = 2.5         # ASSUMED per-cell temperature offset (position), degC
    load_heating_c: float = 3.0       # ASSUMED cell temperature rise at full power, degC
    forecast_temp_sd: float = 2.0     # ASSUMED day-ahead temperature forecast error, degC
    # --- information ---
    sigma_meas: float = 0.02          # ASSUMED per-cell capacity estimate noise (relative)
    meas_bias: float = 0.0            # systematic bias of per-cell capacity reports (relative)
    trend_bias: float = 0.0           # twin underestimates fade rate by this fraction
    sigma_pack_test: float = 0.02     # ASSUMED annual system capacity test noise
    sigma_probe: float = 0.005        # ASSUMED diagnostic probe noise (relative)
    probe_energy_kwh: float = 0.05    # ASSUMED energy per probe
    probe_budget: int = 0             # probes before each peak (condition D)
    twin_samples: int = 64
    alpha: float = 0.05               # deliverability chance constraint: P(D >= P*W) >= 1 - alpha
    # --- economics ---
    rns_2026: float = 183.71          # $/kW-yr, CONFIRMED (ISO-NE)
    rns_increments: tuple = (9.0, 11.0, 13.0, 10.0)  # 2027-2030, ISO-NE "illustrative"
    fca_kw_month: float = 3.58        # $/kW-month, CONFIRMED (FCA 18, 2027/28); held flat ASSUMED
    discount_rate: float = 0.075      # ASSUMED
    augment_cost_kwh: float = 150.0   # ASSUMED $/kWh installed augmentation
    turnkey_cost_kwh: float = 117.0   # BNEF 2025 via press
    co2_kg_per_kwh: tuple = (31.0, 50.0, 92.0)  # LIT band (low, central, high)
    # --- Monte Carlo ---
    n_runs: int = 64
    seed0: int = 0

    @property
    def chem(self) -> Chemistry:
        return CHEMISTRIES[self.chemistry]

    @property
    def n_min(self) -> int:
        return int(round(self.n_series * (1.0 - self.headroom)))

    @property
    def q_nom_ah(self) -> float:
        return self.e_nom_kwh * 1000.0 / (self.n_strings * self.n_series * self.chem.v_nom)

    def with_(self, **kw) -> "Config":
        return replace(self, **kw)

    def hash(self) -> str:
        d = asdict(self)
        return hashlib.sha1(json.dumps(d, sort_keys=True, default=str).encode()).hexdigest()[:10]


SYSTEM_FLAGS = {
    "p_max_kw": (CONFIRMED, "2.5 MW, CESS size; REON says the CESS is white-label, so B/C/D = ~84 EBS blocks of 30 kW / 60 kWh"),
    "e_nom_kwh": (CONFIRMED, "5 MWh (same 2-h ratio as one EBS block)"),
    "n_strings / n_series": (ASSUMED, "EBS string design not public (a 60 kWh block is ~120 cells); ask REON"),
    "headroom": (ASSUMED, "DC-window headroom sets N_min; first-order driver (Lot Desk deck)"),
    "switch_loss": (ASSUMED, "0.5-2% sensitivity; MOSFET I^2 R_ds(on)"),
    "dispatch_days": (ASSUMED, "Operators dispatch on several candidate days per month"),
    "initial_age_years": (ASSUMED, "Mixed-age cohort ages; historical duty and measured SOH unavailable"),
    "tier3_weak_share / tier3_rest_soc": (ASSUMED, "Independent per-cell resting SOC and recharge before peaks are unconfirmed"),
    "guard_threshold": (ASSUMED, "1.5% one-sided exponentially smoothed discrepancy versus annual pack test"),
    "k_hvac / sigma_t_cell": (ASSUMED, "No public CES thermal data; ask REON"),
    "sigma_meas": (ASSUMED, "Brief: per-cell SOH/capacity given; estimation error assumed"),
    "rns_2026": (CONFIRMED, "ISO-NE RNS $183.71/kW-yr, 1 Jan 2026"),
    "rns_increments": (CONFIRMED, "ISO-NE July 2025 forecast, labelled illustrative"),
    "fca_kw_month": (CONFIRMED, "FCA 18: $3.58/kW-month (2027/28); flat thereafter ASSUMED"),
    "peak events": (DERIVED, "ISO-NE SMD 2019-2025: system monthly peaks + WCMA dry bulb"),
    "discount_rate": (ASSUMED, "7.5%"),
    "augment_cost_kwh": (ASSUMED, "$150/kWh installed"),
    "co2_kg_per_kwh": (LIT, "31-92 kg CO2e/kWh cell manufacturing (J. Ind. Ecol. 2025 + others)"),
}
