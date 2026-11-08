"""Facility interval-load data contract, validation, and the demand-target recommendation (EBS C&I scenario).

Data contract  peaksure-facility-load/0.1  (CSV, one row per interval):
    timestamp  ISO 8601 local time at the START of the interval, e.g. 2026-07-15T14:00 (no time zone = site local)
    kw         average real power drawn from the grid at the utility meter over the interval, kilowatts (>= 0)
    Interval: 15 or 60 minutes, constant. National Grid MA G-2 bills the greatest 15-minute demand in the month,
    so hourly data underestimates the billed peak (flagged as a warning).

The recommendation is ADVISORY: a demand target T (kW) for one day so that the battery discharges (load - T)+
each interval. It uses only the operator's belief about deliverable energy (P5) and the rated power; the simulated
plant state is used only afterwards, for evaluation. Nothing here commands hardware.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import math

import numpy as np
import pandas as pd

CONTRACT = "peaksure-facility-load/0.1"
G2_DEMAND_USD_PER_KW_MONTH = 15.24     # CONFIRMED: National Grid MA G-2 delivery demand charge, effective 2026-10-01
G2_SOURCE = "https://www.nationalgridus.com/media/pdfs/billing-payments/tariffs/mae/meco_delivery.pdf (M.D.P.U. No. 1-26-I)"
G2_MAX_KW = 200.0                      # CONFIRMED: G-2 tariff, customers above 200 kW for 3 months may be moved


@dataclass
class Report:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    interval_min: float | None = None
    rows: int = 0
    start: str | None = None
    end: str | None = None


def validate(df: pd.DataFrame, now: pd.Timestamp | None = None, stale_days: float = 35.0) -> tuple[Report, pd.Series | None]:
    """Check schema, units, gaps, duplicates and staleness. Returns (report, kW series indexed by time) or (report, None)."""
    r = Report(ok=False)
    cols = [c.strip().lower() for c in df.columns]
    if cols[:2] != ["timestamp", "kw"]:
        r.errors.append(f"header must be 'timestamp,kw' ({CONTRACT}); got {','.join(df.columns[:3])}")
        return r, None
    df = df.iloc[:, :2].copy()
    df.columns = ["timestamp", "kw"]
    ts = pd.to_datetime(df["timestamp"], errors="coerce")
    kw = pd.to_numeric(df["kw"], errors="coerce")
    bad_t, bad_k = int(ts.isna().sum()), int(kw.isna().sum())
    if bad_t:
        r.errors.append(f"{bad_t} rows have an unreadable timestamp")
    if bad_k:
        r.errors.append(f"{bad_k} rows have a missing or non-numeric kW value")
    s = pd.Series(kw.values, index=ts).dropna()
    s = s[s.index.notna()]
    r.rows = len(s)
    if len(s) < 4:
        r.errors.append("fewer than 4 valid rows")
        return r, None
    dup = int(s.index.duplicated().sum())
    if dup:
        r.errors.append(f"{dup} duplicate timestamps")
    s = s[~s.index.duplicated()].sort_index()
    if (s < 0).any():
        r.errors.append(f"{int((s < 0).sum())} negative kW values (export / net metering is outside this contract)")
    step = s.index.to_series().diff().dropna().dt.total_seconds() / 60
    mode = float(step.mode().iloc[0])
    r.interval_min = mode
    if mode not in (15.0, 60.0):
        r.errors.append(f"interval is {mode:g} min; the contract allows 15 or 60")
    gaps = int((step > mode * 1.01).sum())
    if gaps:
        r.warnings.append(f"{gaps} gaps in the interval sequence")
    if mode == 60.0:
        r.warnings.append("hourly data: the G-2 bill uses the greatest 15-minute demand, so billed peaks can be higher")
    med, mx = float(s.median()), float(s.max())
    if med > 5000:
        r.errors.append(f"median {med:,.0f} 'kW' looks like watts; convert to kW")
    elif mx < 1:
        r.errors.append(f"maximum {mx:.3f} 'kW' looks like MW; convert to kW")
    elif mx > G2_MAX_KW:
        r.warnings.append(f"peak {mx:,.0f} kW exceeds the 200 kW G-2 limit; the confirmed tariff may not apply")
    r.start, r.end = str(s.index.min()), str(s.index.max())
    if now is not None and (now - s.index.max()).days > stale_days:
        r.warnings.append(f"data ends {(now - s.index.max()).days} days before the analysis date (stale)")
    r.ok = not r.errors
    return r, (s if r.ok else None)


@dataclass
class Target:
    target_kw: float              # facility demand limit to hold
    reduction_kw: float           # peak - target
    peak_kw: float
    energy_kwh: float             # battery energy needed = sum((load - T)+) * dt
    max_discharge_kw: float       # largest single-interval discharge
    hours: float                  # duration with discharge > 0
    first_he: int | None
    last_he: int | None
    binding: str                  # "energy" | "power" | "none"


def demand_target(load_kw: np.ndarray, dt_h: float, energy_kwh: float, power_kw: float, tol: float = 1e-6) -> Target:
    """Lowest demand target T such that sum((L-T)+)*dt <= energy and max(L-T) <= power (bisection, monotone in T)."""
    L = np.asarray(load_kw, float)
    peak = float(L.max())
    need = lambda t: float(np.clip(L - t, 0, None).sum() * dt_h)  # noqa: E731
    lo, hi = max(0.0, peak - power_kw), peak
    if energy_kwh <= 0 or power_kw <= 0:
        return Target(peak, 0.0, peak, 0.0, 0.0, 0.0, None, None, "none")
    if need(lo) <= energy_kwh + tol:
        t = lo
        binding = "power"
    else:
        for _ in range(80):
            mid = (lo + hi) / 2
            if need(mid) <= energy_kwh:
                hi = mid
            else:
                lo = mid
        t = hi
        binding = "energy"
    d = np.clip(L - t, 0, None)
    idx = np.where(d > 1e-9)[0]
    per_hour = int(round(1 / dt_h))
    he = lambda i: int(i // per_hour) + 1  # noqa: E731
    return Target(t, peak - t, peak, float(d.sum() * dt_h), float(d.max()), float(len(idx) * dt_h),
                  he(idx[0]) if len(idx) else None, he(idx[-1]) if len(idx) else None, binding)


def peak_day(s: pd.Series) -> pd.Series:
    """The calendar day containing the series maximum (the day that sets the monthly bill)."""
    d = s.idxmax().normalize()
    return s[(s.index >= d) & (s.index < d + pd.Timedelta(days=1))]


def interp_energy(curve_kw: list[float], curve_kwh: list[float], kw: float) -> float:
    """Deliverable energy at a given constant discharge power, interpolated on an exported curve (conservative:
    evaluated at the largest discharge power of the dispatch)."""
    return float(np.interp(kw, curve_kw, curve_kwh))


def monthly_value(reduction_kw: float, usd_per_kw_month: float = G2_DEMAND_USD_PER_KW_MONTH) -> float:
    return reduction_kw * usd_per_kw_month if math.isfinite(reduction_kw) else 0.0


@dataclass
class Continuity:
    discharge_kw: list[float]
    charge_kw: list[float]
    grid_kw: list[float]
    stored_kwh: list[float]
    modes: list[str]
    discharged_kwh: float
    charged_from_grid_kwh: float
    dispatch_shortfall_kwh: float
    min_stored_kwh: float
    end_stored_kwh: float
    reserve_kwh: float
    served_intervals: int


def continuity_schedule(load_kw: np.ndarray, requested_discharge_kw: np.ndarray, dt_h: float,
                        initial_kwh: float, reserve_kwh: float, target_kw: float,
                        charge_power_kw: float, charge_efficiency: float = 0.96) -> Continuity:
    """Grid-connected 24 h operating schedule.

    The battery discharges only down to the reserve. After the first dispatch it recharges during the
    assumed off-peak window (21:00-06:00), without pushing grid import above the demand target. The grid
    supplies any balance, so this is continuity of facility service, not an islanding/outage claim.
    """
    load = np.asarray(load_kw, float)
    requested = np.asarray(requested_discharge_kw, float)
    if load.shape != requested.shape or dt_h <= 0 or initial_kwh < 0 or reserve_kwh < 0:
        raise ValueError("invalid continuity schedule inputs")
    energy = initial_kwh
    reserve = min(reserve_kwh, initial_kwh)
    has_dispatched = False
    discharge: list[float] = []
    charge: list[float] = []
    grid: list[float] = []
    stored: list[float] = []
    modes: list[str] = []
    shortfall = 0.0
    for i, (site, want) in enumerate(zip(load, requested)):
        want = max(0.0, float(want))
        actual = min(want, max(0.0, energy - reserve) / dt_h)
        energy -= actual * dt_h
        shortfall += (want - actual) * dt_h
        has_dispatched = has_dispatched or actual > 1e-9
        hour = (i * dt_h) % 24
        off_peak = hour >= 21 or hour < 6
        room_at_meter = max(0.0, target_kw - float(site))
        charger = 0.0
        if has_dispatched and actual <= 1e-9 and off_peak and energy < initial_kwh - 1e-9:
            charger = min(charge_power_kw, room_at_meter,
                          (initial_kwh - energy) / (charge_efficiency * dt_h))
            energy += charger * charge_efficiency * dt_h
        discharge.append(actual)
        charge.append(charger)
        grid.append(max(0.0, float(site) - actual + charger))
        stored.append(energy)
        modes.append("discharge" if actual > 1e-9 else "charge" if charger > 1e-9 else "standby")
    return Continuity(discharge, charge, grid, stored, modes,
                      float(sum(discharge) * dt_h), float(sum(charge) * dt_h), shortfall,
                      min(stored, default=initial_kwh), energy, reserve, len(load))
