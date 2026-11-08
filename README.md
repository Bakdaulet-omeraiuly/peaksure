# PeakSure

**Know what your battery can deliver when it counts.**
A cell-aware decision tool for REON's cell-level energy storage (the EBS, Energy Block System; REON's CESS and OES are white-label products from other vendors), built for coincident-peak management at Massachusetts municipal light plants (MIT Energy & Climate Hack 2026, REON challenge).

> Independent analysis. Not endorsed by REON. No experiment result is final until it appears in `results/` with seeds and confidence intervals.

## What it does
For each forecast ISO-NE peak, PeakSure decides **how much power, over which window**, a battery should commit. It accounts for the uncertainty in what the battery can actually deliver. It compares:

| | Hardware | Information | Commitment |
|---|---|---|---|
| **A** Conventional | Fixed series string | Annual pack capacity test | Fixed rule (P5 / 3-h window) |
| **B** REON bypass | Cell bypass | Pack test | Fixed rule |
| **C** PeakSure | Cell bypass | Per-cell probabilistic twin | Optimized commitment |
| **D** PeakSure + VoI | Cell bypass | Twin + value-of-information probes | Optimized |

A factorial design (A_opt, A_twin, B_opt, perfect-information runs) separates **physical**, **informational**, **active-information** and **decision-rule** value without double counting.

## Repository
| Path | Content |
|---|---|
| `PLAN.md` | Build plan (phases, owners) |
| `PeakSure-Science-Addendum.md` | Science design, data sheet, evidence audit, change log |
| `DATA_SOURCES.md` | Datasets and how to obtain them |
| `peaksure/` | Simulator: physics, twin, decision, Monte Carlo |
| `tools/` | Data preparation from ISO-NE SMD hourly files |
| `data/processed/` | Derived ISO-NE peak events (2019–2026) with WCMA temperatures |
| `app/` | Streamlit demo (includes a Chemistry & cost tab: Na-ion vs LFP voltage curves, price ranges, capex-aware NPV) |
| `tests/` | Unit tests (including the brief's 16-cell example) |

## PeakSure Studio (web demo)
`web/` holds a Next.js + React Three Fiber app.
- **Studio:** two CES containers (1,920 cells each). Pick a real ISO-NE peak and battery age, then press **Run the peak**. Every cell discharges minute by minute: a conventional string stops at its first empty cell, while REON bypass lets empty or hot cells leave the path. The panels show each operator's belief vs the truth, the 95%-confidence commitment, VoI probes, a calibration watchdog and an event log.
- **Results:** the Monte Carlo study (where it pays, value decomposition, calibration, probing, lifetime).
- **Method:** what is real, what is modelled, and what is not shown.

The browser physics is a TypeScript port of `peaksure/physics.py`, tested against the Python model. Cell ageing comes from the Python model through `tools/export_web.py`. REON product facts and the modelled plant's assumptions, each with an evidence status, live in `peaksure/products.py` and are exported by `tools/export_products.py` to `web/public/data/products.json` (shown in the site's "Product facts vs model assumptions" panel).

```bash
cd web && npm install && npm test && npm run dev     # http://localhost:3000
```

The `/ebs` page is a separate exploratory Na+ EBS block discharge model. Regenerate its
assumption and voltage-floor sensitivity data with `python tools/export_ebs.py`.
The page opens with a single-block EBS C&I demand-charge scenario (`peaksure/ebs_scenario.py`,
regenerate with `python tools/export_ebs_scenario.py`). It is a PeakSure simulation scenario, not
a verified EBS deployment; see Addendum §AL for which EBS facts are confirmed, claimed or assumed.
Above it, an advisory demand-target planner for one EBS block at a National Grid MA G-2 site reads meter data in the
`peaksure-facility-load/0.1` CSV format (a labelled SYNTHETIC sample is bundled; rebuild it with
`python tools/build_facility_loads.py --download`). See `PILOT_READINESS.md` (demo / pilot / not live control) and
`DATA_AUDIT.md` (which public data was used, and how).

## Run (Python model)
```bash
pip install -r requirements.txt pytest
pytest -q
python -m peaksure.experiments --quick      # precompute results into results/
streamlit run app/app.py
```

Streamlit Community Cloud: deploy `app/app.py` from `main` with Python 3.11; it installs `requirements.txt`.

## Data
- ISO-NE SMD hourly files (2019–2026). Download them from ISO-NE's zone-info page into `data/isone/`, then run `tools/build_peak_events.py`. The derived event table is included.
- Na-ion parameters are informed by Bahrke et al., *EES Batteries* 2 (2026) 1157. LFP parameters are informed by Naumann et al. 2018. See `DATA_SOURCES.md`.
