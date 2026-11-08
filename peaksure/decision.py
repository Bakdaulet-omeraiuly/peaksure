"""Peak commitment: choose window start s (hour-ending), length W (h) and power P (kW).

Discharge runs at P from the start of the window. The battery shaves the actual peak hour h
if h falls inside the window and the energy consumed through the end of hour h, P*(h-s+1),
does not exceed the deliverable energy D. Value is proportional to the kW shaved at h (the
monthly RNS / annual capacity rate multiplies every decision equally, so the argmax does not
depend on it).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .data import HE_GRID

W_MAX = 6
N_P = 80


@dataclass
class Decision:
    start_he: int
    window_h: int
    power_kw: float
    exp_value_kw: float          # expected shaved kW under the decision-maker's belief

    @property
    def energy_kwh(self) -> float:
        return self.power_kw * self.window_h


def _coverage(p_hour: np.ndarray, start_idx: int, w: int) -> np.ndarray:
    return p_hour[start_idx:start_idx + w]


def optimize(d_samples: np.ndarray, p_avail: float, p_hour: np.ndarray,
             alpha: float | None = 0.05) -> Decision:
    """Optimal commitment under a sample-based belief over deliverable energy.

    Maximizes expected shaved kW subject to a deliverability chance constraint:
    P(D >= P * W) >= 1 - alpha, i.e. the battery can sustain the committed power for the whole
    window with the stated confidence. alpha=None gives the unconstrained expected-value optimum.
    """
    d = np.sort(np.asarray(d_samples, dtype=float))
    k_s = d.size
    p_grid = np.linspace(p_avail / N_P, p_avail, N_P)
    best = Decision(int(HE_GRID[0]), 1, 0.0, -1.0)
    for w in range(1, W_MAX + 1):
        ks = np.arange(1, w + 1)
        need = p_grid[:, None] * ks[None, :]                       # (P, k)
        prob_ok = 1.0 - np.searchsorted(d, need, side="left") / k_s  # P(D >= need)
        feasible = np.ones(N_P, bool) if alpha is None else prob_ok[:, -1] >= 1.0 - alpha
        if not feasible.any():
            continue
        for si in range(0, len(HE_GRID) - w + 1):
            cov = _coverage(p_hour, si, w)
            u = np.where(feasible, p_grid * (prob_ok * cov[None, :]).sum(axis=1), -1.0)
            j = int(np.argmax(u))
            if u[j] > best.exp_value_kw:
                best = Decision(int(HE_GRID[si]), w, float(p_grid[j]), float(u[j]))
    if best.exp_value_kw < 0:
        best = Decision(int(HE_GRID[int(np.argmax(p_hour))]), 1, 0.0, 0.0)
    return best


def fixed_rule(d_p5: float, p_avail: float, p_hour: np.ndarray) -> Decision:
    """Conventional practice: discharge at full available power for as many whole hours as the
    (conservative, P5) energy estimate allows, centred on the most likely peak hour."""
    if p_avail <= 0 or d_p5 <= 0:
        return Decision(int(HE_GRID[int(np.argmax(p_hour))]), 1, 0.0, 0.0)
    w = int(np.clip(np.floor(d_p5 / p_avail), 1, W_MAX))
    p = float(min(p_avail, d_p5 / w))
    mode_idx = int(np.argmax(p_hour))
    si = int(np.clip(mode_idx - (w - 1) // 2, 0, len(HE_GRID) - w))
    ev = p * float(_coverage(p_hour, si, w).sum())
    return Decision(int(HE_GRID[si]), w, p, ev)


def outcome(dec: Decision, actual_he: int, d_true: float, p_true: float) -> tuple[float, float, bool]:
    """Returns (shaved_kw, energy_dispatched_kwh, full_success)."""
    p_eff = min(dec.power_kw, p_true)
    energy_used = min(d_true, p_eff * dec.window_h)
    k = actual_he - dec.start_he + 1
    if dec.power_kw <= 0 or k < 1 or k > dec.window_h:
        return 0.0, energy_used, False
    if p_eff * k <= d_true + 1e-9:
        return p_eff, energy_used, p_eff >= dec.power_kw - 1e-9
    return 0.0, energy_used, False


def expected_value(d_samples: np.ndarray, dec: Decision, p_hour: np.ndarray) -> float:
    """Expected shaved kW of a fixed decision under a belief (used for VoI)."""
    if dec.power_kw <= 0:
        return 0.0
    d = np.sort(d_samples)
    si = int(np.where(HE_GRID == dec.start_he)[0][0])
    ks = np.arange(1, dec.window_h + 1)
    prob_ok = 1.0 - np.searchsorted(d, dec.power_kw * ks, side="left") / d.size
    return float(dec.power_kw * (prob_ok * _coverage(p_hour, si, dec.window_h)).sum())


def commitment_status(dec: Decision, d_p5_kwh: float, p_max_kw: float, e_nom_kwh: float, eta: float) -> str:
    """Classify a commitment at the AC boundary (mirrors web/src/engine/commitment.ts).

    commitment energy = power x window. 'exceeds-rated' if it is above the DC nameplate x eta (an upper
    bound on AC energy) or power above rating; 'exceeds-belief' if above the operator's believed P5.
    """
    e = dec.energy_kwh
    tol = 1e-6 * max(1.0, e)
    if dec.power_kw <= 0:
        return "no-commitment"
    if e > e_nom_kwh * eta + tol or dec.power_kw > p_max_kw + 1e-6:
        return "exceeds-rated"
    if e > d_p5_kwh + tol:
        return "exceeds-belief"
    return "feasible"
