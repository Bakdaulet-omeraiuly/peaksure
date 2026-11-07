"""Representative cell voltage curves: sodium-ion (layered oxide / hard carbon) vs LFP (LiFePO4 / graphite).

These are REPRESENTATIVE SHAPES for illustration and DC-window reasoning, not measured REON cells:
  - Na-ion: sloped curve over 1.5-3.8 V (TUM / Bahrke et al. 2026 voltage window), energy-average about 3.1 V.
  - LFP: flat plateau about 3.25-3.34 V between ~10% and ~90% SOC, 2.5-3.65 V window (typical datasheets).
Terminal voltage = OCV -/+ overpotential, with overpotential linear in C-rate (ASSUMED values).

Why it matters: a series string must stay above the inverter's DC floor. With a sloped Na-ion curve the
string voltage falls steadily, so fewer cells can be bypassed late in a discharge; LFP keeps its voltage
until nearly empty.
"""

from __future__ import annotations

import numpy as np

from .config import ASSUMED, LIT

# (SOC, OCV in V) anchor points
OCV_TABLE = {
    "Na-ion": np.array([
        (0.00, 1.50), (0.02, 2.10), (0.05, 2.45), (0.10, 2.65), (0.20, 2.85), (0.30, 2.97), (0.40, 3.07),
        (0.50, 3.16), (0.60, 3.26), (0.70, 3.37), (0.80, 3.49), (0.90, 3.62), (0.95, 3.70), (1.00, 3.80)]),
    "LFP": np.array([
        (0.00, 2.50), (0.02, 2.95), (0.05, 3.15), (0.10, 3.21), (0.20, 3.25), (0.30, 3.27), (0.40, 3.285),
        (0.50, 3.29), (0.60, 3.30), (0.70, 3.32), (0.80, 3.33), (0.90, 3.34), (0.95, 3.37), (0.98, 3.45),
        (1.00, 3.60)]),
}
V_LIMITS = {"Na-ion": (1.5, 3.8), "LFP": (2.5, 3.65)}
# Overpotential per 1C (V); terminal = OCV - c_rate * this on discharge, + on charge.
OVERPOT_PER_C = {"Na-ion": 0.10, "LFP": 0.06}

FLAGS = {
    "Na-ion shape": (LIT, "Sloped layered-oxide/hard-carbon curve, 1.5-3.8 V window (TUM, Bahrke et al. 2026); points approximated"),
    "LFP shape": (LIT, "Flat LFP plateau, 2.5-3.65 V window (typical datasheets); points approximated"),
    "overpotential": (ASSUMED, "Linear in C-rate: Na-ion 0.10 V/C, LFP 0.06 V/C"),
}


def ocv(chem: str, soc) -> np.ndarray:
    t = OCV_TABLE[chem]
    return np.interp(np.clip(soc, 0.0, 1.0), t[:, 0], t[:, 1])


def terminal_v(chem: str, soc, c_rate: float, charging: bool) -> np.ndarray:
    lo, hi = V_LIMITS[chem]
    dv = c_rate * OVERPOT_PER_C[chem]
    return np.clip(ocv(chem, soc) + (dv if charging else -dv), lo, hi)


def energy_avg_v(chem: str, n: int = 1001) -> float:
    s = np.linspace(0.0, 1.0, n)
    return float(np.trapezoid(ocv(chem, s), s)) if hasattr(np, "trapezoid") else float(np.trapz(ocv(chem, s), s))


def min_soc_above_floor(chem: str, n_active: int, v_floor: float, c_rate: float = 0.5) -> float:
    """Lowest SOC at which n_active series cells (discharging) still exceed the DC floor; 1.0 if never."""
    s = np.linspace(0.0, 1.0, 2001)
    ok = n_active * terminal_v(chem, s, c_rate, charging=False) >= v_floor
    return float(s[ok].min()) if ok.any() else 1.0
