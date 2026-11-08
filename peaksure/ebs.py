"""Exploratory EBS block simulation, separate from the existing plant-level study.

Only the 30 kW / 60 kWh Na+ block rating is a REON product input. Cell count,
capacity, topology, DC/DC floor, switch resistance and weak-cell prevalence are
assumptions. Parallel blocks are independent; no shared DC-bus dynamics are modeled.
"""
from __future__ import annotations

from dataclasses import dataclass

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


def simulate(case: EBSCase, q_full: np.ndarray, bypass: bool, minutes: int = 240, dt_min: float = 0.25) -> dict:
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
    steps = int(minutes / dt_min)
    for step in range(steps + 1):
        minute = step * dt_min
        soc = np.divide(remaining, q_full, out=np.zeros_like(remaining), where=q_full > 0)
        v_cell = terminal_v("Na-ion", soc, 0.5, charging=False)
        v = (v_cell * active).sum(axis=1)
        n_active = active.sum(axis=1)
        online &= (v >= case.dc_floor_v) & (n_active >= (case.n_min if bypass else case.cells_per_block))
        if not bypass:
            online &= ~((remaining <= 0) & active).any(axis=1)
        r = n_active * (case.r_on_ohm if bypass else 0.0)
        p_dc = case.block_kw * 1000 / case.eta
        disc = v * v - 4 * r * p_dc
        online &= disc >= 0
        current = np.zeros(case.blocks)
        direct = online & (r == 0)
        switched = online & (r > 0)
        current[direct] = p_dc / v[direct]
        current[switched] = 2 * p_dc / (v[switched] + np.sqrt(disc[switched]))
        if step % int(5 / dt_min) == 0:
            trace.append(dict(minute=minute, power_kw=float(online.sum() * case.block_kw),
                              bypassed_cells=int(bypassed.sum())))
        if minute in (0, 60, 90, 100, 105, 110, 120, 180, 240):
            checkpoints[str(int(minute))] = dict(power_kw=float(online.sum() * case.block_kw),
                                                blocks_online=int(online.sum()),
                                                bypassed_cells=int(bypassed.sum()))
        if step == steps:
            break
        if online.all():
            full_power_steps += 1
        remaining -= current[:, None] * active * dt_min / 60
        delivered += online * case.block_kw * dt_min / 60
        if bypass:
            newly_empty = (remaining <= 0) & active & online[:, None]
            bypassed += newly_empty.sum(axis=1)
            active[newly_empty] = False
            remaining[newly_empty] = 0
    return dict(energy_kwh=float(delivered.sum()), full_power_minutes=full_power_steps * dt_min,
        checkpoints=checkpoints, power_trace=trace, bypassed_cells=int(bypassed.sum()),
        blocks_online_end=int(online.sum()), nameplate_kwh=case.blocks * 60)
