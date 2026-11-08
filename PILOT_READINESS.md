# PeakSure: what REON can use, and what is still missing (8 Nov 2026)

PeakSure is an **advisory** decision-support prototype. It sends no command to any battery, inverter, BMS or EMS, and every recommendation needs human review.

## Readiness

| Level | Status | What it means |
|---|---|---|
| Demo / product review | **Ready** | `/ebs` runs offline on the bundled synthetic sample: data checks, demand-target recommendation, why, simulated plant check, conventional vs REON-style comparison, sensitivity, report export. `/` and `/results` show the plant-scale CES-sized study. |
| Supervised, read-only data pilot | **Ready to start once REON supplies data** | A site's meter CSV in `peaksure-facility-load/0.1` can be uploaded and checked today. Battery belief still comes from the simulated EBS block until REON supplies per-cell capacity estimates and the product parameters below. |
| Live battery control | **Not ready** | No REON interface, no product validation, no safety review. See the checklist below. |

## Operator flow (today)

1. Product and application: EBS Na+ (simulated), National Grid MA G-2 (confirmed $15.24/kW-month, 15-minute billing demand).
2. Data: bundled SYNTHETIC sample (NREL simulated retail building) or an uploaded CSV.
3. Data quality: header, timestamps, numeric values, duplicates, negatives, interval (15/60 min), gaps, units (W / MW detection), staleness, 200 kW G-2 limit. Rejected data produces no recommendation.
4. Peak day: the day that sets the month's bill (the peak day is assumed known; forecasting it is not yet modelled).
5. Recommendation: demand target, discharge window, energy, peak discharge, binding constraint, from the twin's P5 (95% confidence) only.
6. Why: the energy limit, peak, window and binding constraint, plus the P50 target for comparison.
7. Simulated plant check: revealed only on request, never used by the decision.
8. Difference and sensitivity: conventional vs REON-style on the same data, cells, belief and rule; three cell states; three demand charges.
9. Export: JSON / Markdown report with the input SHA-256, assumptions and limitations.

## Data contract `peaksure-facility-load/0.1`

CSV with header `timestamp,kw`. `timestamp`: ISO 8601 site-local time at the start of each interval. `kw`: average grid import at the utility meter over the interval, kilowatts, ≥ 0. Constant 15- or 60-minute interval. Versioned so a REON telemetry format can replace it without changing the planner (`peaksure/facility.py`, `web/src/engine/facility.ts`).

**Not yet defined (needs REON):** a per-cell battery-state contract (cell id, capacity estimate and uncertainty, resistance, temperature, SOC, bypass state, timestamp). No API was invented.

## What REON must provide for a supervised pilot

- EBS Na+ datasheet: rating basis (AC/DC, usable vs nameplate), efficiency, DC window, cells per block and arrangement, N_min, switch R_on, charge/discharge temperature limits.
- A read-only export of per-cell estimates from the EBS BMS (format, cadence, units) and a sample file.
- One or more customer sites with 15-minute meter data (under NDA) and the EBS units installed there.
- Agreement that recommendations are reviewed by a person before any manual dispatch.

## Before any live control (not started)

- Port the decision to REON's EMS under REON's software process; PeakSure would remain a recommender.
- Validate the twin and the block model against measured EBS discharges (out-of-sample), including the current-dependent voltage drop (the model's fixed 0.5C overpotential is a known gap).
- Fail-safe behaviour for missing, stale or inconsistent data (today: refuse and report).
- Hazard analysis, interlocks and certification scope (UL 9540 / 9540A as applicable), site interconnection limits, cybersecurity review.
- Field trial with logging, rollback and operator override.

## Known limitations

Hourly sample data underestimates the 15-minute billed peak; the peak day is assumed known; EBS internals are assumptions; the plant-scale cell twin is over-confident (P5 miss rate above its 5% target, see `RESULTS.md`); the EBS energy curve ignores current-dependent voltage drop; no ageing in the EBS scenario; nothing here is hardware validation.
