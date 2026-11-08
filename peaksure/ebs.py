"""Exploratory EBS block simulation, separate from the existing plant-level study.

Only the 30 kW / 60 kWh Na+ block rating is a REON product input. Cell count,
capacity, topology, DC/DC floor, switch resistance and weak-cell prevalence are
assumptions. Parallel blocks are independent; no shared DC-bus dynamics are modeled.
"""
from __future__ import annotations

from dataclasses import dataclass
import base64

import numpy as np

from .curves import terminal_v


@dataclass(frozen=True)
class EBSCase:
    blocks: int = 84          # 84 * 30 kW = 2.52 MW; 84 * 60 kWh = 5.04 MWh
    cells_per_block: int = 120  # ASSUMED, approximately 60 kWh at 3.1 V and 161 Ah
    cell_ah: float = 60_000 / (120 * 3.1)
    block_kw: float = 30.0
    dc_floor_v: float = 300.0  # ASSUMED DC/DC input floor, not a published EBS spec
    n_min: int = 108           # ASSUMED 10% bypass headroom
    r_on_ohm: float = 0.0001   # ASSUMED per active cell switch path
    eta: float = 0.96          # ASSUMED DC-to-AC efficiency
    capacity_cov: float = 0.0115  # TUM Na-ion initial capacity spread, not EBS measurement
    weak_factor: float = 0.8   # ASSUMED one cell per block has 80% capacity
    seed: int = 42


def population(case: EBSCase) -> np.ndarray:
    rng = np.random.default_rng(case.seed)
    q = case.cell_ah * np.maximum(0.5, 1 + rng.normal(0, case.capacity_cov, (case.blocks, case.cells_per_block)))
    weak_index = rng.integers(0, case.cells_per_block, size=case.blocks)
    q[np.arange(case.blocks), weak_index] *= case.weak_factor
    return q


def simulate(case: EBSCase, q_full: np.ndarray, bypass: bool, minutes: float = 240, dt_min: float = 0.25,
             detail: bool = False) -> dict:
    """Constant rated-power discharge of independent blocks on identical cells.

    Terminal voltage changes with SOC. A fixed string stops at the first empty cell;
    bypass removes empty cells until active count falls below n_min. Both stop at
    the assumed DC input floor. Only bypass carries per-cell switch resistance.
    """
    if q_full.shape != (case.blocks, case.cells_per_block):
        raise ValueError("cell population shape does not match case")
    if not 1 <= case.n_min <= case.cells_per_block or case.dc_floor_v < 0 or case.r_on_ohm < 0:
        raise ValueError("invalid EBS electrical assumptions")
    remaining = q_full.copy()
    active = np.ones_like(q_full, dtype=bool)
    online = np.ones(case.blocks, dtype=bool)
    delivered = np.zeros(case.blocks)
    bypassed = np.zeros(case.blocks, dtype=int)
    full_power_steps = 0
    checkpoints = {}
    trace = []
    weak_cell = int(np.argmin(q_full[0]))
    steps = int(round(minutes / dt_min))
    first_bypass_min, stop_min, stop_cell, stop_reason = None, None, None, None
    for step in range(steps + 1):
        minute = step * dt_min
        soc = np.divide(remaining, q_full, out=np.zeros_like(remaining), where=q_full > 0)
        v_cell = terminal_v("Na-ion", soc, 0.5, charging=False)
        v = (v_cell * active).sum(axis=1)
        n_active = active.sum(axis=1)
        was_online = bool(online[0])
        reasons = []
        if detail and was_online:
            if v[0] < case.dc_floor_v:
                reasons.append("DC voltage floor")
            if n_active[0] < (case.n_min if bypass else case.cells_per_block):
                reasons.append("fewer than N_min active cells")
            if not bypass and ((remaining[0] <= 0) & active[0]).any():
                reasons.append("first empty cell in the fixed string")
        online &= (v >= case.dc_floor_v) & (n_active >= (case.n_min if bypass else case.cells_per_block))
        if not bypass:
            online &= ~((remaining <= 0) & active).any(axis=1)
        r = n_active * (case.r_on_ohm if bypass else 0.0)
        p_dc = case.block_kw * 1000 / case.eta
        disc = v * v - 4 * r * p_dc
        if detail and was_online and disc[0] < 0:
            reasons.append("switch-path loss: power not reachable")
        online &= disc >= 0
        current = np.zeros(case.blocks)
        direct = online & (r == 0)
        switched = online & (r > 0)
        current[direct] = p_dc / v[direct]
        current[switched] = 2 * p_dc / (v[switched] + np.sqrt(disc[switched]))
        if step % int(5 / dt_min) == 0:
            trace.append(dict(minute=minute, power_kw=float(online.sum() * case.block_kw),
                              bypassed_cells=int(bypassed.sum()), block_online=bool(online[0]),
                              soc_b64=base64.b64encode(np.rint(np.clip(soc[0], 0, 1) * 255).astype("u1").tobytes()).decode(),
                              active_b64=base64.b64encode(active[0].astype("u1").tobytes()).decode()))
        if minute in (0, 60, 90, 100, 105, 110, 120, 180, 240):
            checkpoints[str(int(minute))] = dict(power_kw=float(online.sum() * case.block_kw),
                                                blocks_online=int(online.sum()),
                                                bypassed_cells=int(bypassed.sum()))
        if detail and stop_min is None and not online[0]:
            stop_min = minute
            stop_reason = "; ".join(reasons) or "not online at start"
            if not bypass and "first empty cell in the fixed string" in reasons:
                stop_cell = int(np.argmin(remaining[0]))      # the cell that stopped the string (engine state)
        if step == steps:
            break
        if online.all():
            full_power_steps += 1
        remaining -= current[:, None] * active * dt_min / 60
        delivered += online * case.block_kw * dt_min / 60
        if bypass:
            newly_empty = (remaining <= 0) & active & online[:, None]
            bypassed += newly_empty.sum(axis=1)
            if detail and first_bypass_min is None and newly_empty[0].any():
                first_bypass_min = minute + dt_min
            active[newly_empty] = False
            remaining[newly_empty] = 0
    out = dict(energy_kwh=float(delivered.sum()), full_power_minutes=full_power_steps * dt_min,
        checkpoints=checkpoints, power_trace=trace, weak_cell=weak_cell, bypassed_cells=int(bypassed.sum()),
        blocks_online_end=int(online.sum()), nameplate_kwh=case.blocks * 60)
    if detail:
        out.update(block_energy_kwh=delivered, first_bypass_min=first_bypass_min, stop_min=stop_min,
                   stop_cell=stop_cell, stop_reason=stop_reason, final_soc=np.divide(remaining, q_full, out=np.zeros_like(remaining), where=q_full > 0))
    return out
