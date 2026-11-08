# PeakSure: Build Plan

> **Current interpretation (2026-11-07):** This historical plan uses “CES” and older assumed topology language. The current REON hardware page calls the grid product “CESS” (up to 2.5 MW / 5 MWh); a project-cited REON PDF calls it “CES” and says 480 V three-phase AC. Main simulator chemistry, 8 × 240 model units, N_min, losses, and cell-side interpretation of 5 MWh are assumptions. See Addendum §AK and the generated Results for current labels and limitations.

> One-liner: Massachusetts towns buy batteries to hit one hour a year. PeakSure uses REON's cell-level intelligence to make sure the battery delivers in that hour, and puts a dollar value on that certainty.

**Docs**

| File | What it covers |
|---|---|
| `PLAN.md` (this file) | Who does what, and when |
| `PeakSure-Science-Addendum.md` | Science design and all market, economic, CO₂ and REON data (§A–§H) |
| `DATA_SOURCES.md` | Raw battery datasets and how to download them |

**Roles**

| Role | Owns |
|---|---|
| **CS1** | Engine: cells, aging, Monte Carlo, tiers |
| **CS2** | Digital twin and dashboard |
| **Econ/dispatch** | ISO-NE peaks, commitment rule, economics |
| **Deck/research** | Deck, assumptions research, REON Q&A, CO₂ |

---

> **Priorities:** P0 (must work), P1 (differentiator), P2 (optional) are defined in **Addendum §X**. No P1/P2 work starts before the P0 end-to-end run produces Table T1.
> **New from the team Drive (Addendum §AA–§AD):**
> - The official brief lets us assume per-cell SOH/capacity/resistance data and free cell switching.
> - The ISO-NE SMD files are processed (`data/isone/peak_temps.csv`): annual peaks are summer HE18–19 at 84–97 °F; winter monthly peaks go down to −18 °C.
> - Real MLP numbers: Sterling and Holden.
> - Thermal channel ("hot cell rests") is P1.

## Phase 0: Setup (everyone, first hour)

- [ ] GitHub repo with `engine/`, `twin/`, `app/`, `data/`, `config/`, `docs/`. Put the 3 md files in `docs/`.
- [ ] Create `config.yaml` with every assumption, each marked `confirmed` or `assumed`, with its source. Defaults:
  - chemistry: Na-ion or LFP (switchable)
  - cells per string: 250–420 (proxy, Addendum §H5)
  - N_min
  - cell variability: new vs aged (Addendum §H4)
  - fade rates: from TUM / Naumann data
  - switch loss: 0.5–2%
  - RNS $183.71/kW-yr (2026)
  - FCA $3.58/kW-mo (2027/28)
  - discount rate: 7–8%
  - horizon: 15 years
- [ ] Agree the data contract:
  - Cell state array: `runs × cells × months`.
  - **Keep `cells_true` (the plant) and `cells_twin` (what the twin believes) separate from day 1** (Addendum §A).
  - Engine output: deliverable MWh per tier per month per run.
- [ ] Send the Discord questions to REON:
  1. CESS chemistry
  2. DC voltage and cells per string
  3. N_min
  4. Switch losses and round-trip efficiency
  5. Per-cell measurement accuracy
  6. Duty cycle in MLP projects (peaks only, or stacked with other services?)
- [ ] Start the downloads in the background (DATA_SOURCES §1, §2b). Download the check-up files only first.

**Done when:** the repo is set up, the config exists, everyone knows the data shapes, and the questions are sent.

## Phase 1: Core engine (CS1)

- [ ] Cell population generator. Spread of capacity and resistance for new cells (capacity RSD ~0.4%, resistance ~2.5%) and for aged cells (wider; Addendum §H4).
- [ ] Controller tiers:
  - **Tier 1, conventional:** passive balancing; the weakest cell ends the discharge.
  - **Tier 2, REON bypass:** respects N_min and the voltage window.
- [ ] The 16-cell validation test from the brief: conventional gives 70 Ah, and bypass with N_min = 1 gives the sum.

**Meanwhile:**
- **CS2:** dashboard skeleton on fake data.
- **Econ:** pull ISO-NE hourly load; find the historical monthly and annual peak hours.
- **Deck:** deck outline, and fix the numbers using Addendum §H1. Sterling $17K is likely a 1-hour discharge (sources conflict); the annual peak is $240,660 (Sandia).

**Done when:** the 16-cell test passes.

## Phase 2: Aging + Monte Carlo (CS1)

- [ ] Monthly aging loop:
  - calendar fade (SOC- and temperature-dependent) plus cycle fade, with a winter temperature factor;
  - fit to the TUM Na-ion data, or to Naumann LFP data;
  - BLAST-Lite only as a fallback.
- [ ] Monte Carlo: 100 runs first, then scale up.
- [ ] Plot deliverable MWh over 15 years per tier as P5/P50/P95 bands.
- [ ] *(Optional)* **Tier 3, lifetime-aware:** hold the weakest cells at a lower SOC between peaks (Addendum §C).

**Meanwhile:**
- **CS2:** digital twin. A per-cell ensemble (K ≈ 20–50) with a Bayesian update from noisy measurements gives the confidence band. The noise model is grounded in REON's 100 Hz per-cell monitoring.
- **Econ:** the commitment rule. **Start with P95, then replace it with the optimal commitment q\*** (newsvendor, Addendum §B). Add hit/miss scoring and the economics formulas (Addendum §D).

**Done when:** the conventional tier's P5 curve visibly falls away from REON's over time. This chart is the core result.

## Phase 3: Connect the pieces (CS1 + Econ)

- [ ] Engine output feeds dispatch, giving hit/miss for every monthly and annual peak, per run and per tier.
- [ ] Hits and misses feed economics:
  - savings
  - **Peak-Savings-at-Risk**
  - NPV
  - break-even premium
  - oversizing avoided
- [ ] Connect the twin: commitments are based on the twin's estimate, not the true value, so uncertainty now costs money.
- [ ] **Mismatch test** (Addendum §A): inject twin error ε = 0/10/20/30%. Make a reliability chart: nominal 5% vs observed miss rate, for conventional vs CESS.
- [ ] **EVPI** (Addendum §B): split the value into physical (bypass) and informational (tighter band).

- [ ] **Novelty: decision-focused diagnostics** (CS2, Addendum §I). Add a "probe" action to the twin. Compare three probing policies: none, round-robin, and VoI. Output: $ value per probe, and the shift in q* after probing.

**Done when:** one end-to-end run produces a break-even premium number, plus the reliability chart.

## Phase 4: Dashboard (CS2)

- [ ] Five views:
  1. Cell map
  2. Twin bands
  3. Peak scorecard
  4. Money view (PSaR, NPV, break-even, EVPI)
  5. Assumptions panel (confirmed vs assumed)
- [ ] Sliders: variability, N_min, switch loss, rates, **twin error ε**.
- [ ] Cache results so slider changes respond within a few seconds.

**Done when:** a teammate who didn't build it can change a slider and understand the result.

## Phase 5: Sanity checks + sensitivity (Econ + CS1)

- [ ] Checks:
  - No variability → no REON advantage.
  - N_min = N → REON equals conventional.
  - More variability → bigger REON advantage.
  - **Zero twin error and zero noise → EVPI = 0.**
  - **At ε = 0, the observed miss rate below P5 is about 5%.**
  - **No aging → Tier 2 = Tier 3.**
- [ ] Tornado chart: which assumption moves the break-even premium most?
- [ ] Fill in REON's answers as they arrive and rerun.
- [ ] *(Optional)* Augmentation scenario: an old string plus 10–20% new cells (Addendum §F).

**Done when:** the results pass the checks, and we know the top 3 drivers.

## Phase 6: Story + demo (everyone, led by Deck)

- [ ] Headline numbers: missed-peak probability, Peak-Savings-at-Risk, break-even premium.
- [ ] Novelty line: *"PeakSure doesn't just predict. Before the peak, it asks the battery: it uses REON's switches to probe only the cells whose uncertainty actually matters."* Then show the VoI vs round-robin chart.
- [ ] Opening hook: Nature Energy 2026 found **19–27% of energy stranded** when the weakest cell retires. Verify against the paper.
- [ ] Deck flow: problem → hidden risk → PeakSure → demo → value → environment → scalability → limits.
- [ ] Environment: lead with **avoided cell manufacturing** (31–92 kg CO₂e/kWh band). **Do not headline peaker CO₂.** In ISO-NE it is roughly neutral on average (Addendum §E.3).
- [ ] Limits slide:
  - CESS design is assumed.
  - The aging model is simplified.
  - Cold-weather aging is an assumption.
  - REON's "2–3×" is a company claim; our model shows X.
  - This is independent analysis, not endorsed by REON.
- [ ] 3-minute live demo: start with a healthy pack, age it, show the twin bands diverge, show the money.
- [ ] Rehearse at least twice, and keep a backup screen recording.

**Done when:** the pitch fits the time and the demo works offline.

---

## Claim rules (everyone)

- Every number is computed by us (with Monte Carlo bands) or cited.
- Never say "first" without "to our knowledge".
- Show where REON's advantage is small.
