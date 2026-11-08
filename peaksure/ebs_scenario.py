"""PeakSure EBS scenario: one 30 kW / 60 kWh EBS-size block shaving a commercial facility's demand peak.

This is a PeakSure SIMULATION SCENARIO, not a verified EBS deployment or a REON operating profile.
It is separate from the 2.5 MW CES-sized MLP study and does not change its results.

Evidence (reoncorp.com, checked 2026-11-08; see peaksure/products.py):
  - "EBS | 30kW/60kWh" is the EBS line heading (CONFIRMED). The page does not say which variant it rates;
    Li+ claims "more than twice the energy in the same form factor", so 60 kWh is taken to be Na+ (DERIVED).
    Rated vs usable, AC vs DC: UNKNOWN.
  - EBS is "designed for commercial and industrial applications" (CONFIRMED, product text). REON's EMS lists
    "Peak Shaving & Demand Management ... to reduce demand charges" (REON CLAIM, not EBS-specific).
  - Li+ capacity is not stated, so Li+ is NOT simulated here.

Comparison design: both batteries use the SAME cells, the SAME per-cell capacity estimates (twin belief), the
SAME 95% chance-constrained rule, the same window and tariff. Only the hardware differs (fixed series string vs
per-cell bypass), so any difference is physical bypass value, net of the assumed switch loss.

Before the event the decision sees only the belief (estimated cell capacities); the simulated plant state
(true capacities) is used only afterwards to evaluate the outcome.
"""
from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np

from .ebs import EBSCase, simulate

ASSUMED, DERIVED, MODEL_OUTPUT = "ASSUMED", "DERIVED", "MODEL OUTPUT"


@dataclass(frozen=True)
class Scenario:
    rated_kw: float = 30.0            # EBS line heading (CONFIRMED); power boundary (AC/DC) UNKNOWN
    rated_kwh: float = 60.0           # EBS line heading (CONFIRMED); variant DERIVED Na+, basis UNKNOWN
    window_start_he: int = 15         # ASSUMED facility peak window starts HE15 (14:00)
    sigma_meas: float = 0.02          # ASSUMED per-cell capacity estimate error (same as main study)
    belief_samples: int = 200
    alpha: float = 0.05               # 95% chance of sustaining the committed power for the whole window
    power_step_kw: float = 0.25
    seed: int = 2026


WINDOWS_H = (1, 2, 3)                       # ASSUMED facility peak-window lengths (sensitivity)
WEAK_CASES = (1.0, 0.9, 0.8)                # 1.0 = natural TUM spread only; 0.9/0.8 = labelled stress cases
# $/kW-month. G-2 CONFIRMED (National Grid MA, effective 2026-10-01); low / high are ASSUMED sensitivity values.
DEMAND_CHARGE = {"G-2": 15.24, "low": 10.0, "high": 20.0}
CURVE_KW = (5.0, 10.0, 15.0, 20.0, 25.0, 30.0)

FLAGS = {
    "rated_kw": ("CONFIRMED", "reoncorp.com/hardware: 'EBS | 30kW/60kWh' (line heading; AC/DC boundary not stated)"),
    "rated_kwh": ("CONFIRMED", "same heading; variant not stated. Na+ assignment DERIVED from the Li+ '>2x energy' claim"),
    "nominal_ratio_h": (DERIVED, "60 kWh / 30 kW = 2 h; nominal ratio, not a guaranteed AC discharge duration"),
    "use_case": (ASSUMED, "C&I demand-charge peak shaving: PeakSure scenario; REON's EMS lists peak shaving (REON CLAIM)"),
    "window": (ASSUMED, "facility billing peak assumed inside a window starting HE15; consistent with NREL/OpenEI simulated "
                        "Boston retail summer peaks at HE15-16 (RELATED EXTERNAL DATA); timing uncertainty not modelled"),
    "demand_charge": ("CONFIRMED", "National Grid MA G-2 delivery demand charge $15.24/kW-month, M.D.P.U. No. 1-26-I, effective "
                                   "2026-10-01; billed on the greatest 15-minute demand. "
                                   "$10 and $20 are ASSUMED sensitivity values"),
    "sigma_meas": (ASSUMED, "2% per-cell capacity estimate error, same for both batteries"),
    "cells / N_min / DC floor / R_on / eta": (ASSUMED, "from EBSCase: 120 cells, N_min 108, 300 V floor, 0.1 mOhm, 96%"),
    "temperature": (ASSUMED, "not modelled (25 C); REON's -40 to +140 F claim gives no charge/discharge or derating limits"),
    "age": (ASSUMED, "new cells (age 0); no ageing or calendar year in this single-event scenario"),
    "li_ion": ("UNKNOWN", "EBS Li+ energy, power and chemistry not stated; not simulated"),
}


def _case(base: EBSCase, n_blocks: int, kw: float) -> EBSCase:
    return replace(base, blocks=n_blocks, block_kw=kw)


def true_cells(base: EBSCase) -> np.ndarray:
    """Simulated plant state for one block (block 0 of the seeded population, with the weak-cell case applied)."""
    from .ebs import population
    return population(replace(base, blocks=1))[0]


def estimate(q_true: np.ndarray, sc: Scenario) -> tuple[np.ndarray, np.ndarray]:
    """Per-cell capacity estimate (twin mean) and its sd. Only these are visible to the decision."""
    rng = np.random.default_rng(sc.seed)
    mean = q_true * (1 + sc.sigma_meas * rng.standard_normal(q_true.shape))
    return mean, sc.sigma_meas * mean


def belief_samples(mean: np.ndarray, sd: np.ndarray, sc: Scenario) -> np.ndarray:
    rng = np.random.default_rng(sc.seed + 1)
    return np.maximum(0.05 * mean, mean + sd * rng.standard_normal((sc.belief_samples, mean.size)))


def sustain_chance(base: EBSCase, samples: np.ndarray, bypass: bool, kw: float, hours: float) -> float:
    """Share of belief samples that sustain kw for the whole window (energy, N_min, DC floor and R_on included)."""
    r = simulate(_case(base, samples.shape[0], kw), samples, bypass, minutes=hours * 60, detail=True)
    return float(np.mean(r["block_energy_kwh"] >= kw * hours - 1e-6))


def deliverable_energy(base: EBSCase, samples: np.ndarray, bypass: bool, kw: float) -> np.ndarray:
    """AC energy each belief sample delivers at constant kw until the block stops."""
    minutes = 60 * 1.2 * base.cells_per_block * base.cell_ah * 3.8 / 1000 / max(kw, 1e-6)
    r = simulate(_case(base, samples.shape[0], kw), samples, bypass, minutes=minutes, detail=True)
    return np.asarray(r["block_energy_kwh"])


def energy_curve(base: EBSCase, cells: np.ndarray, bypass: bool) -> dict:
    """Deliverable AC energy vs constant discharge power. cells: (K, n) belief samples or (1, n) simulated plant."""
    rows = [deliverable_energy(base, cells, bypass, kw) for kw in CURVE_KW]
    if cells.shape[0] == 1:
        return dict(kw=list(CURVE_KW), kwh=[float(r[0]) for r in rows])
    return dict(kw=list(CURVE_KW), p5=[float(np.percentile(r, 5)) for r in rows],
                p50=[float(np.percentile(r, 50)) for r in rows], p95=[float(np.percentile(r, 95)) for r in rows])


def commit(base: EBSCase, samples: np.ndarray, bypass: bool, hours: float, sc: Scenario) -> tuple[float, float]:
    """Largest power on the step grid (<= rated) with P(sustain for the window) >= 1 - alpha. Binary search;
    the chance is non-increasing in power. Returns (power_kw, chance)."""
    grid = np.arange(sc.power_step_kw, sc.rated_kw + 1e-9, sc.power_step_kw)
    lo, hi, best = 0, len(grid) - 1, (0.0, 1.0)
    while lo <= hi:
        mid = (lo + hi) // 2
        ch = sustain_chance(base, samples, bypass, float(grid[mid]), hours)
        if ch >= 1 - sc.alpha:
            best, lo = (float(grid[mid]), ch), mid + 1
        else:
            hi = mid - 1
    return best


def run_case(weak: float, hours: int, sc: Scenario = Scenario(), base: EBSCase = EBSCase()) -> dict:
    base = replace(base, weak_factor=weak)
    q_true = true_cells(base)
    mean, sd = estimate(q_true, sc)
    samples = belief_samples(mean, sd, sc)
    out = dict(weak_factor=weak, window_h=hours, start_he=sc.window_start_he,
               diagnosis_cell=int(np.argmin(mean)),       # from the belief, not the hidden plant state
               true_weakest_cell=int(np.argmin(q_true)))
    for name, bypass in (("fixed", False), ("bypass", True)):
        kw, chance = commit(base, samples, bypass, hours, sc)
        e = deliverable_energy(base, samples, bypass, kw if kw > 0 else sc.rated_kw)
        truth = simulate(_case(base, 1, kw if kw > 0 else sc.rated_kw), q_true[None, :], bypass,
                         minutes=hours * 60, detail=True)
        delivered = float(truth["block_energy_kwh"][0]) if kw > 0 else 0.0
        fulfilled = kw > 0 and delivered >= kw * hours - 1e-6
        drain = simulate(_case(base, 1, sc.rated_kw), q_true[None, :], bypass, minutes=240, detail=True)
        out[name] = dict(
            commit_kw=kw, commit_energy_kwh=kw * hours, chance=chance,
            belief_p5=float(np.percentile(e, 5)), belief_p50=float(np.percentile(e, 50)),
            belief_p95=float(np.percentile(e, 95)),
            outcome=dict(delivered_kwh=delivered, fulfilled=bool(fulfilled),
                         stop_min=truth["stop_min"], stop_cell=truth["stop_cell"], stop_reason=truth["stop_reason"],
                         first_bypass_min=truth["first_bypass_min"], bypassed_cells=truth["bypassed_cells"],
                         trace=truth["power_trace"]),
            drain=dict(energy_kwh=float(drain["block_energy_kwh"][0]), stop_min=drain["stop_min"],
                       stop_reason=drain["stop_reason"],
                       stop_cell=drain["stop_cell"], first_bypass_min=drain["first_bypass_min"],
                       stranded_kwh=float((drain["final_soc"][0] * q_true).sum() * 3.1 / 1000)
                       if drain["stop_min"] is not None else 0.0,
                       trace=drain["power_trace"]),
        )
    return out


def commitment_status(power_kw: float, hours: float, p5_kwh: float, rated_kw: float, rated_kwh: float,
                      eta: float) -> str:
    """Same rule as web/src/engine/commitment.ts and decision.commitment_status."""
    e = power_kw * hours
    tol = 1e-6 * max(1.0, e)
    if power_kw <= 0:
        return "no-commitment"
    if e > rated_kwh * eta + tol or power_kw > rated_kw + 1e-6:
        return "exceeds-rated"
    if e > p5_kwh + tol:
        return "exceeds-belief"
    return "feasible"


def export(sc: Scenario = Scenario(), base: EBSCase = EBSCase()) -> dict:
    cases = []
    for weak in WEAK_CASES:
        for h in WINDOWS_H:
            c = run_case(weak, h, sc, base)
            for name in ("fixed", "bypass"):
                c[name]["status"] = commitment_status(c[name]["commit_kw"], h, c[name]["belief_p5"],
                                                      sc.rated_kw, sc.rated_kwh, base.eta)
            cases.append(c)
    curves = []
    for weak in WEAK_CASES:
        b = replace(base, weak_factor=weak)
        q_true = true_cells(b)
        mean, sd = estimate(q_true, sc)
        samples = belief_samples(mean, sd, sc)
        curves.append(dict(weak_factor=weak,
                           belief={hw: energy_curve(b, samples, hw == "bypass") for hw in ("fixed", "bypass")},
                           plant={hw: energy_curve(b, q_true[None, :], hw == "bypass") for hw in ("fixed", "bypass")}))
    return dict(
        title="EBS scenario: C&I demand-charge peak shaving (PeakSure simulation)",
        energy_curves=curves,
        use_case="One 30 kW / 60 kWh EBS-size block reduces a commercial facility's monthly demand peak. "
                 "PeakSure simulation scenario; not a verified EBS deployment or REON operating profile.",
        profiles={"EBS Na+": "simulated (rating from the EBS line heading; cells, N_min, DC floor, R_on, efficiency ASSUMED)",
                  "EBS Li+": "not simulated: energy only claimed as 'more than twice ... same form factor'; "
                             "exact kWh, power and chemistry UNKNOWN"},
        rated_kw=sc.rated_kw, rated_kwh=sc.rated_kwh, eta=base.eta, alpha=sc.alpha, n_min=base.n_min,
        cells=base.cells_per_block, dc_floor_v=base.dc_floor_v, r_on_ohm=base.r_on_ohm,
        demand_charge=DEMAND_CHARGE, flags={k: list(v) for k, v in FLAGS.items()}, cases=cases,
    )
