# AGENTS.md: PeakSure (read this first)

Instructions for AI coding agents (Codex, Claude, Kiro) and human contributors.

## What this project is
PeakSure is our MIT Energy & Climate Hack 2026 entry for the **REON challenge** ("Beyond the Weakest Cell"). REON makes battery systems with a **switch at every cell**: any cell can be bypassed, and every cell is monitored. PeakSure answers one operational question:

> Before each ISO-NE peak, how much power, over which window, should a Massachusetts municipal light plant's battery commit, given uncertainty about what its cells can deliver?

It compares four setups on the same cells, with the same random draws:

| ID | Hardware | Belief | Commitment rule |
|---|---|---|---|
| **A** | fixed series strings | annual pack test | full-power rule |
| **B** | assumed cell bypass at CES/CESS nameplate size | annual pack test | full-power rule |
| **C** | same assumed bypass | per-cell Kalman estimator | 95% chance-constrained commitment |
| **D** | as C | as C | as C, plus value-of-information (VoI) probes |

- Live demo: https://peaksure-energy.vercel.app
- Repo: https://github.com/Bakdaulet-omeraiuly/peaksure

## Repository map
| Path | What |
|---|---|
| `peaksure/` | **Python model.** `physics.py` (fixed vs bypass strings, temperature), `twin.py` (Kalman twin, pack estimator), `decision.py` (commitment), `sim.py` (15-year Monte Carlo, conditions A–D and research policies), `econ.py` (RNS/FCA $, NPV, decomposition), `research.py` (paired extension summaries), `experiments.py` (full study), `config.py` (**every parameter carries an evidence flag**) |
| `data/processed/` | ISO-NE peak events 2019–2025 + peak-day shapes (derived from the SMD files) |
| `tools/` | `build_peak_events.py` (SMD → events), `report.py` (results → `RESULTS.md` / `web/public/data/results.json`), `export_web.py` (model → web data) |
| `results/` | saved Monte Carlo outputs (parquet) + `manifest.json` |
| `app/` | older Streamlit analysis app (secondary) |
| `web/` | **PeakSure** (Next.js 16 + React Three Fiber). `src/engine/` is a TypeScript port of the browser physics, twin, decision and VoI, **tested against the Python model**. The new longitudinal research policies run in Python and appear as generated results; they are not interactive browser controls. `src/components/` is the UI. `public/data/` is exported data |
| `PeakSure-Science-Addendum.md` | method, data sheet, evidence audit, change log (**§AF = REON questions answered**) |
| `RESULTS.md` | generated; do not edit by hand |
| `PLAN.md`, `DATA_SOURCES.md`, `DEMO.md` | plan, datasets, demo script |

## Commands
```bash
# Python (use the anaconda python)
pytest -q                                        # 18 tests incl. the brief's 16-cell example
python -m peaksure.experiments [--only main|probe|cal|sens|research] [--quick]
python tools/report.py && python tools/report.py --json
python tools/export_web.py                       # only if ageing/model changed

# Web
cd web && npm install && npm test && npx tsc --noEmit && npm run dev
cd web && vercel deploy --prod --yes             # deploy (project peaksure-energy)
```

## Rules (non-negotiable)
1. **Never hardcode a result.** Every number in the UI or docs must come from `results/`, the generated JSON, or a live engine computation. Text that quotes numbers must compute them.
2. **Python and TypeScript physics must agree.** If you change `peaksure/physics.py`, port the change to `web/src/engine/physics.ts`, re-export the fixture (`python tools/export_web.py --fixture`), and keep `web` tests green.
3. **Keep truth and belief separate.** Decisions only see `CellTwin` / `PackEstimator`, never the true cell states.
4. **Honesty over hype.**
   - Report null and negative results.
   - Keep the decision-rule effect separate from REON hardware value (Shapley decomposition in `econ.decomposition`).
   - Label each parameter CONFIRMED / REON CLAIM / LIT / DERIVED / ASSUMED / UNKNOWN in `config.py`.
   - Never claim grid-CO₂ savings.
   - Present REON's "2–4×" only as a company claim.
   - Never call the simulator hardware validation.
5. **After changing the model:** rerun the affected experiment part, regenerate `RESULTS.md` and `results.json`, then update the Addendum change log (§Z).
6. **Git:** commit as the repo owner. **Do not add Co-Authored-By or AI attribution lines.** Push to `main` after the tests pass.
7. **Do not commit** raw third-party data (REON brief PDFs, ISO-NE xlsx, papers); see `.gitignore`.

## Current findings (see `RESULTS.md` for numbers)
- On the 2-h CES/CESS-sized hypothetical cell-bypass model doing coincident-peak duty, cell-level value is **near zero**: peak timing dominates, and energy rarely binds. REON's CES/CESS internal topology and chemistry are unknown.
- It pays with cell faults, weak or failing cooling, 1-h systems and 4-h systems.
- The raw cell twin is **over-confident even in the base case** and breaks under systematic bias, so it is diagnostic only. Production candidate C/D now use the sample-wise lower envelope of the twin and an independent annual pack-test belief. The full validation matrix passes the simulated 5% P5-miss and 95% full-delivery gates; hardware validation remains blocked pending REON topology and held-out/HIL data (`VALIDATION.md`).
- Mixed-age cohorts and lifetime resting-SOC policies are exploratory synthetic studies (§AG, RESULTS §T6). Do not claim a measured lifetime or efficiency gain.
- VoI probes pay in only ~4% of peaks; PeakSure skips the rest.
- **Switch loss = I·R_on / V_cell** is first-order (each cell's switch carries the full string current, ~420 A at 8 strings).

## Open items
- Ask REON for two numbers:
  - switch R_on per cell path, and the number of parallel columns;
  - the CES DC window and cells per column.
- Read the Nature Energy (Zhou et al. 2026) and Chalmers (Nat. Commun. 2026) papers in full; we only have press numbers so far.
- Na-ion ageing is fitted to the TUM **tables** (`peaksure/fit_tum.py`); fit to the raw TUM trajectories and LFP (Naumann) is still open.
- Switching: `peaksure/switching.py` (R_on → switch loss, bypass transient, break-even). Questions to REON: `REON_QUESTIONS.md`.
- Pitch deck.
