"""Cell- and string-level physics for PeakSure (vectorised NumPy).

Conventions
  Arrays of cells have shape (..., n_strings, n_series). A leading axis, if present, is a
  sample axis (twin belief samples). Capacities are in Ah, energies in kWh, power in kW.

Fixed string (Tier 1, "conventional"): same current through every cell, so the string's
  usable charge is the minimum available charge of its cells (the brief's 16-cell example).
Bypass string (Tier 2/3, REON): an exhausted (or hot, or faulted) cell leaves the active path,
  and the string continues while at least N_min cells are active (valid DC voltage).
"""

from __future__ import annotations

import numpy as np

R_GAS = 8.314
T_REF_K = 298.15


# ---------------------------------------------------------------- string capacity (Ah)
def fixed_string_ah(avail_ah: np.ndarray, faulted: np.ndarray | None = None) -> np.ndarray:
    """Usable Ah of a fixed series string = min over cells. A faulted cell takes the string offline."""
    ah = avail_ah.min(axis=-1)
    if faulted is not None:
        ah = np.where(faulted.any(axis=-1), 0.0, ah)
    return ah


def bypass_string_energy_ah(avail_ah: np.ndarray, n_min: int,
                            excluded: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Bypass string: cells drop out as they empty; the string stops when active cells < n_min.

    Returns (cell_ah_sum, cutoff_ah):
      cutoff_ah   a* = charge throughput at which the active count falls below n_min
      cell_ah_sum sum_i min(A_i, a*), the total cell-Ah delivered (energy = v_nom * this)
    Excluded cells (hot / faulted) contribute nothing and do not count as active.
    """
    a = np.where(excluded, 0.0, avail_ah) if excluded is not None else avail_ah
    n = a.shape[-1]
    n_eligible = n - (excluded.sum(axis=-1) if excluded is not None else 0)
    srt = np.sort(a, axis=-1)                       # ascending; excluded cells sit at 0
    k = n - n_min                                   # index of the cell whose exhaustion stops the string
    cutoff = np.take_along_axis(srt, np.full(srt.shape[:-1] + (1,), k), axis=-1)[..., 0]
    cutoff = np.where(n_eligible >= n_min, cutoff, 0.0)
    cell_ah_sum = np.minimum(a, cutoff[..., None]).sum(axis=-1)
    return cell_ah_sum, cutoff


# ---------------------------------------------------------------- temperature effects
def container_temp(t_amb: float | np.ndarray, set_c: float, k_hvac: float) -> np.ndarray:
    """Container air temperature: HVAC holds the setpoint, leaking a fraction k of ambient deviation."""
    return set_c + k_hvac * (np.asarray(t_amb) - set_c)


def cold_capacity_factor(t_cell: np.ndarray, slope: float) -> np.ndarray:
    """Discharge capacity factor below 25 C (linearised from -40 C retention data)."""
    return np.clip(1.0 - slope * np.maximum(0.0, 25.0 - t_cell), 0.3, 1.0)


def fixed_string_power_derate(t_cell_max: np.ndarray, t_derate: float, t_max: float) -> np.ndarray:
    """Fixed string: the hottest cell limits current for the whole string (linear derate)."""
    return np.clip(1.0 - (t_cell_max - t_derate) / max(t_max - t_derate, 1e-6), 0.0, 1.0)


def arrhenius(t_c: np.ndarray | float, ea_kj: float) -> np.ndarray:
    return np.exp(-ea_kj * 1000.0 / R_GAS * (1.0 / (np.asarray(t_c) + 273.15) - 1.0 / T_REF_K))


def soc_stress(soc: np.ndarray | float, t_c: float, beta25: float, beta45: float,
               low_pen: float) -> np.ndarray:
    """Calendar SOC stress factor g(SOC, T); the SOC sensitivity grows with temperature."""
    w = np.clip((t_c - 25.0) / 20.0, 0.0, 1.0)
    beta = beta25 + (beta45 - beta25) * w
    soc = np.asarray(soc)
    return np.maximum(0.2, 1.0 + beta * (soc - 0.5) + low_pen * (soc < 0.2))


# ---------------------------------------------------------------- deliverable energy
def deliverable(q_ah: np.ndarray, *, tier: str, v_nom: float, n_min: int, soc0: np.ndarray,
                t_cell: np.ndarray, chem, eta: float, switch_loss: float, p_string_max: float,
                faulted: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Deliverable energy (kWh) and available power (kW) per string at a peak event.

    q_ah, soc0, t_cell, faulted: (..., n_strings, n_series)
    Returns energy_kwh, power_kw with shape (..., n_strings).
    """
    avail = q_ah * soc0 * cold_capacity_factor(t_cell, chem.cold_slope)
    n_series = q_ah.shape[-1]
    if tier == "fixed":
        ah = fixed_string_ah(avail, faulted)
        energy = ah * v_nom * n_series / 1000.0 * eta
        derate = fixed_string_power_derate(t_cell.max(axis=-1), chem.t_derate, chem.t_max)
        power = p_string_max * derate * (ah > 0)
    else:
        hot = t_cell > chem.t_derate
        excluded = hot if faulted is None else (hot | faulted)
        # never bypass hot cells below N_min: if too many are hot, keep them and derate instead
        too_many = (n_series - excluded.sum(axis=-1)) < n_min
        if np.any(too_many):
            base_excl = faulted if faulted is not None else np.zeros_like(hot)
            excluded = np.where(too_many[..., None], base_excl, excluded)
        ah_sum, cutoff = bypass_string_energy_ah(avail, n_min, excluded)
        energy = ah_sum * v_nom / 1000.0 * eta * (1.0 - switch_loss)
        t_active_max = np.where(excluded, -np.inf, t_cell).max(axis=-1)
        derate = fixed_string_power_derate(t_active_max, chem.t_derate, chem.t_max)
        power = p_string_max * derate * (cutoff > 0)
    return energy, power


def reference_deliverable(q_ah: np.ndarray, *, tier: str, v_nom: float, n_min: int, chem,
                          eta: float, switch_loss: float) -> np.ndarray:
    """Deliverable energy at reference conditions (25 C, full charge), summed over strings."""
    e, _ = deliverable(q_ah, tier=tier, v_nom=v_nom, n_min=n_min, soc0=np.ones_like(q_ah),
                       t_cell=np.full_like(q_ah, 25.0), chem=chem, eta=eta,
                       switch_loss=switch_loss, p_string_max=1.0)
    return e.sum(axis=-1)
