# PeakSure

**Know what your battery can deliver when it counts.**
A cell-aware decision study for coincident-peak shaving at Massachusetts municipal light plants. The comparison uses the public REON CES/CESS nameplate size; its cell-bypass topology is a hypothesis, not a published CES/CESS design (MIT Energy & Climate Hack 2026, REON challenge).

> Independent analysis. Not endorsed by REON. No experiment result is final until it appears in `results/` with seeds and confidence intervals.

## What it does
For each forecast ISO-NE peak, PeakSure decides **how much power, over which window**, a battery should commit. It accounts for the uncertainty in what the battery can actually deliver. It compares:

| | Hardware | Information | Commitment |
|---|---|---|---|
| **A** Conventional | Fixed series string | Annual pack capacity test | Fixed rule (full available power for a P5-bounded whole-hour window) |
| **B** Bypass model | Assumed cell bypass at CES/CESS nameplate size | Pack test | Fixed rule |
| **C** PeakSure | Same assumed bypass | Per-cell probabilistic estimator constrained by an independent annual pack-test safety envelope | 95%-bounded optimized commitment |
| **D** PeakSure + VoI | Same assumed bypass | Guarded estimator + value-of-information probes | 95%-bounded optimized commitment |

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
| `VALIDATION.md` | Generated software acceptance gates and A/B/raw/C stress-scenario matrix |

## PeakSure Studio (web demo)
`web/` holds a Next.js + React Three Fiber app.
- **Explore:** schematic batteries with 8 × 240 model cell units each, not drawings of CES hardware. Pick a real ISO-NE peak, a modeled battery age, and a CES-sized 2 h or hypothetical 1/3/4 h system. The panels separate nameplate ratio, commitment window and energy, belief, simulated truth, and outcome. The main plant simulator does not enforce a CES DC voltage window because it is unknown.
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

REON's [current hardware page](https://www.reoncorp.com/hardware) calls the grid product **CESS** and lists up to 2.5 MW / 5 MWh. A REON PDF cited in the project Addendum calls it **CES** and states 480 V three-phase AC; that PDF is not stored in this repository. The 2 h ratio is derived from the two nameplate numbers and is not a verified AC discharge duration. CES chemistry, cell count, parallel columns, DC window, N_min, switch resistance, PCS efficiency, and energy rating boundary remain unknown. Source check: 2026-11-07.

## Run (Python model)
```bash
pip install -r requirements.txt pytest
pytest -q
python -m peaksure.experiments --quick      # precompute results into results/
python -m peaksure.validation --quick       # software gates; full run omits --quick
streamlit run app/app.py
```

Streamlit Community Cloud: deploy `app/app.py` from `main` with Python 3.11; it installs `requirements.txt`.

## Data
- ISO-NE SMD hourly files (2019–2026). Download them from ISO-NE's zone-info page into `data/isone/`, then run `tools/build_peak_events.py`. The derived event table is included.
- Na-ion parameters are informed by Bahrke et al., *EES Batteries* 2 (2026) 1157. LFP parameters are informed by Naumann et al. 2018. See `DATA_SOURCES.md`.
