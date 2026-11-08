---
title: "PeakSure: Scientific Addendum"
subtitle: "How we make the model defensible, and what is genuinely new"
---

> **Reading guide.** Part I (§0–§I, §H) is the original addendum. **Part II (§J–§Z)** is the strengthening pass: research question, architecture, benchmark design, calibration, VoI protocol, engineering constraints, economics, demo, evidence audit, roadmap, pitch, and change log. Corrections to Part I are listed in §Z. **No experiment has been run yet. All results are placeholders.**

# 0. Purpose

This addendum plugs into the **PeakSure** plan (MLP coincident-peak use case on REON's CES). It does **not** change the idea. It adds:

1. a test proving the twin's confidence band is trustworthy (instead of assuming it),
2. a principled rule for *how much* energy to commit to a peak (replacing a fixed "commit P95"),
3. an optional third control tier (lifetime-aware) with a realistic aging lever for a rarely-cycled battery,
4. correct accounting for degradation cost, Peak-Savings-at-Risk, and CO₂e,
5. a clear statement of what is known from the literature vs what our contribution is.

| Section | Plugs into plan phase | Owner (suggested) |
|---|---|---|
| A. Twin calibration and mismatch test | Phase 2–3 (twin) | CS2 |
| B. Optimal peak commitment | Phase 3 (dispatch) | dispatch/economics owner |
| C. Tier 3: lifetime-aware control | Phase 2 (engine), optional | CS1 |
| D. Economics | Phase 3 | dispatch/economics owner |
| E. Environment | Phase 3 / deck | Person 4 |
| F. Mixed-age and augmentation scenarios | Phase 5 | CS1 |
| G. Extra sanity checks | Phase 5 | everyone |

---

# Known vs New (read this first)

**Already established. We build on it and cite it, and must not claim it as ours:**

- In series strings, the weakest cell limits usable energy. Lumped pack models can **overestimate SoH by up to 31%** in a real 324-cell second-life system (arXiv 2609.04487).
- Bypassing or reconfiguring weak cells extends life. Chalmers, *Nature Communications* (Oct 2026), modelled **>20% longer life** for EV packs.
- Battery aging cost can be modelled convexly (rainflow) inside optimizers (Shi, Xu, Kirschen et al.).

**Our contribution (to our knowledge, from a limited literature search, not a full review):**

> **Deliverable-energy certainty as an economic quantity.** For coincident-peak applications, we price the *uncertainty* in what the battery can deliver. We show how cell-level measurement and control shrink it, and how much that is worth in $, including **when the twin itself is wrong**.

Concretely: (1) Peak-Savings-at-Risk for conventional vs CES over 15 years; (2) the **expected value of perfect information** (EVPI) about deliverable energy; (3) how both change under deliberate twin–plant mismatch; (4) **decision-focused diagnostics**: using REON's switches as a measurement instrument, and choosing which cells to probe before a peak by value of information (§I).

**Claim rules:** never say "first" without "to our knowledge"; every number is either computed by us (with Monte Carlo bands) or cited; and we show where the CES advantage is small.

---

# A. Twin Calibration and Mismatch Test

## Problem
PeakSure says the confidence band "stays narrow as the battery ages, because it's built from measured cells." This is the central claim of the pitch, and it is currently an **assumption**. Judges from REON will ask: *what if the twin is wrong?*

Known evidence:
- Model–plant mismatch biases SoH estimates even when the model is correctly parameterized (arXiv 2504.13324).
- In grid storage, deliberately **underestimating** available energy in the controller's model made control more robust (Sandia/UT Austin, OSTI 1592238).

## Method
1. **Truth vs belief are separate objects in code.** `cells_true` (the engine's real plant) and `cells_twin` (what the twin believes). The twin only sees **noisy measurements** of `cells_true`.
2. **Twin = ensemble per cell** (K ≈ 20–50 parameter sets: capacity, resistance, fade coefficients), reweighted by a Bayesian / particle-filter update on each measurement.
3. **Inject mismatch:** give the twin's aging model an error ε ∈ {0, 10, 20, 30%}, both random **and systematic bias** (e.g. the twin underestimates fade rate by ε).
4. **Calibration check (reliability):** over all Monte Carlo runs, how often is the true deliverable energy below the twin's P5? A calibrated twin gives ≈ 5%.
   - Plot the **observed vs nominal miss rate** for the conventional (pack-level estimate) and CES (cell-level estimate) twins, at each ε.

## Expected result (hypothesis, to be tested)
The cell-level twin stays calibrated longer than the pack-level estimate, because it does not average away the limiting cell. Under systematic bias, both degrade, and **we report by how much**.

## Done when
A reliability chart and a table: nominal 5% vs observed miss rate × {conventional, CES} × ε.

---

# B. Optimal Peak Commitment (replaces fixed "commit P95")

## Problem
"Commit P95" is arbitrary. Committing too much risks running empty before the peak. Committing too little wastes energy and narrows the covered window. This is a classic **newsvendor** trade-off.

## Method
Let **D** be the true deliverable energy (random, with the twin's belief distribution F), and **q** the committed energy (a wider q covers a wider peak window).

- **c_u:** marginal value of committing one more kWh when the battery can deliver it (a wider window raises the probability of catching the peak).
- **c_o:** marginal expected loss when the commitment exceeds D (the battery runs out, so the peak may be missed).

Under linear approximations, the optimal commitment is the critical quantile:

$$ q^* = F^{-1}\!\left(\frac{c_u}{c_u + c_o}\right) $$

In practice c_u and c_o are not constant: the value of a window depends on the peak-timing distribution from ISO-NE history. So we **search q numerically in the Monte Carlo** and use the formula only for intuition.

## Value of information
$$ \text{EVPI} = \mathbb{E}[V(D, D)] - \max_q \mathbb{E}[V(q, D)] $$

This is the $ lost purely because we don't know D exactly. **The narrower and better-calibrated the twin, the closer the CES gets to the perfect-information value.** This turns "cell-level intelligence" into a dollar number, separate from the bypass (physical) benefit.

## Decomposition for the pitch
Total CES advantage = **physical** (bypass gives more deliverable energy) + **informational** (a tighter band gives a bigger safe commitment). Report both parts separately. REON hears exactly which part of their product creates which value.

## Done when
A chart of the optimal q and the expected savings vs twin σ, and EVPI in $/year for conventional vs CES.

---

# C. Tier 3: Lifetime-Aware Control (optional)

## Key physical point
An MLP coincident-peak battery may cycle **rarely**: 12 monthly peaks plus one annual peak, plus whatever else it is stacked with (ConnectedSolutions events, arbitrage). This depends on the project, so **ask REON and the MLPs**. If cycling is rare, **calendar aging dominates**, and controlling cycle depth barely matters.

Calendar aging in LFP/graphite rises with **storage SoC and temperature**. Naumann et al., *J. Energy Storage* 17 (2018) 153–169, DOI 10.1016/j.est.2018.01.019, ran 17 storage conditions × 3 cells for ~29 months and fit a 5-parameter semi-empirical model, with validation errors <2.2% for capacity and <6.9% for resistance. **Raw data is public on Mendeley** (dataset kxh42bfgtj), so it can be used directly to fit our calendar term.

Sodium-ion: a 2026 *EES Batteries* study of commercial layered-oxide 18650 cells found that sodium plating is a significant failure mode and that high SoC drives cathode material loss. A 2022 *J. Power Sources* study found strong dependence on temperature, C-rate, and storage SoC. So the "lower SoC at rest" lever (Tier 3) **plausibly applies to Na-ion too**, but its parameters are much less certain, so use wide ranges.

## Method
- **Tier 1:** conventional (the weakest cell ends the discharge).
- **Tier 2:** REON bypass (per the plan).
- **Tier 3:** Tier 2 plus, **between peaks, hold the weakest cells at lower SoC** (and rest them in non-critical cycles). Bring them to full SoC only before forecast peak windows.
- Trade-off to quantify: a lower storage SoC on weak cells slows their calendar fade but costs readiness if the peak forecast is wrong. Tie this back to Section B.

## Done when
Deliverable P5 at year 10 and 15 for Tiers 1/2/3. If Tier 3 adds little, **say so**. That is still a valid finding.

---

# D. Economics

## Headline metric: Peak-Savings-at-Risk (PSaR)
$$ \text{PSaR}_{\text{year}} = \mathbb{E}[\text{savings} \mid \text{perfect delivery}] - \text{P5}(\text{realized savings}) $$

Compute this per tier and per year. Optionally also report the **expected** savings loss (mean, not tail).

## Savings model
- Monthly transmission (RNS) and annual capacity savings come from **load reduction at the coincident-peak hour**. Use per-MW rates from public tariffs and the MLP case studies (Sterling: ~$17K per monthly-peak discharge, ~$244K per annual-peak discharge; cite).
- Hit or miss per peak comes from the dispatch (Section B) and the true deliverable energy (engine).

## Degradation cost
Do **not** value aging as simple depreciation ($/kWh ÷ cycle life). That proxy can cut profit by 30–50% in optimization (arXiv 2403.10617). Value aging as **lost future savings** (fade reduces future deliverable energy, which raises future PSaR). Our Monte Carlo already does this naturally if savings are computed per year from the aged state.

## Break-even premium (already in the plan; keep it)
$$ \text{Premium}_{\max} = \text{NPV}(\text{CES}) - \text{NPV}(\text{conventional, same nameplate}) $$

Also report the alternative: **oversizing avoided**. How much extra conventional capacity is needed to match the CES's P5 deliverable energy? Price it.

## Tornado
Variables to include: cell variability, N_min, switch loss, RNS rate, capacity rate, discount rate, calendar-fade rate, twin bias ε.

---

# E. Environment

| Quantity | Value | Use |
|---|---|---|
| Li-ion cell manufacturing, current | ~58–92 kg CO₂e/kWh_cell (J. Industrial Ecology 2025, cradle-to-gate) | upper band |
| LFP, optimized production | ~37 kg CO₂e/kWh (same study) | lower band |
| LFP typical range | 31–71 kg CO₂e/kWh (secondary source) | context |
| Na-ion (layered oxide), cradle-to-gate | ~75–87 kg CO₂e/kWh vs LFP 59–70 in the same study (secondary coverage) | Na-ion upper |
| Na-ion pack, China factory data (2026) | 56.8 kg CO₂e/kWh vs LFP pack 75.5 (−25%) | Na-ion lower |
| Na-ion vs LFP, peer-reviewed (Voß et al., *EES* 2025) | 4 of 7 Na-ion chemistries within 1–8% of LFP | "about equal" |

Metrics:
1. **Avoided manufacturing CO₂e** = (kWh of oversizing avoided + kWh of augmentation/replacement deferred within the horizon) × EF. Report with the **31–92 band**, not a single number.
2. **gCO₂e per delivered kWh** = embodied CO₂e / lifetime kWh delivered. Lower is better, and it is robust and easy to defend.
3. **Peaker displacement (from the plan). Be careful here.** ISO-NE's 2024 Air Emissions Report gives a time-weighted marginal CO₂ rate of **~700 lb/MWh, with on-peak only slightly above off-peak** (read from Figure 1-14). Natural gas combined-cycle is the marginal unit 85–97% of the time in every month. Charging at ~700 and discharging at ~710 with round-trip efficiency η ≈ 0.85 means:
   - net CO₂ per MWh discharged ≈ 690/0.85 − 720 ≈ **+90–110 lb/MWh, a slight *increase*** on average.
   - A real reduction occurs only in the true peak hours when gas simple-cycle or oil is marginal (e.g. July: simple-cycle ~13% of load; December: oil ~5%).

   So **do not headline "fewer peaker hours."** Lead with avoided cell manufacturing (metrics 1–2). Mention grid CO₂ only as "roughly neutral on average; positive only at true system peaks." This honesty is a credibility win with technical judges.

Do not double count: second-life cells' original manufacturing belongs to their first life.

---

# F. Mixed-Age and Augmentation Scenarios

Run in Phase 5 if time allows:

- **Augmentation:** a 7-year-old string plus 10–20% new cells. Conventional: the old cells drag the new ones down. CES: every cell contributes. This answers the brief's Discord question: "can new cells be mixed into aged strings?"
- **Variability sweep:** a wider initial capacity/resistance spread should give a bigger CES advantage. This doubles as a sanity check.
- **Second-life share** (0–50%): only if REON confirms the CES could use second-life cells.

Fault handling: real second-life systems contain faulty cells (2 of 324 in the arXiv 2609.04487 field data). Add a rule: a cell whose voltage deviates by more than kσ is permanently bypassed. This shows that bypass also improves **reliability**, not just capacity.

---

# G. Extra Sanity Checks (add to Phase 5)

In addition to the plan's checks (zero variability gives no advantage; N_min = N gives REON = conventional):

- **Zero twin error and zero measurement noise:** EVPI = 0, and the optimal q equals the true D.
- **Calibration:** at ε = 0, the observed miss rate below P5 is about 5%.
- **No aging:** Tiers 2 and 3 are identical.
- **Peak timing known perfectly:** PSaR comes only from energy uncertainty.

---

# Extra Questions for REON (add to the Discord list)

1. CES chemistry: Na-ion, LFP, or both? Cell format and capacity?
2. Typical duty cycle in MLP projects: peaks only, or stacked with ConnectedSolutions/arbitrage? This determines whether calendar or cycle aging dominates.
3. Can the CES hold different SoC per cell at rest (needed for Tier 3)?
4. What cell-level measurements are available, and at what frequency and accuracy? This sets the twin's measurement noise.

---

# I. Novelty: Decision-Focused Diagnostics ("the battery that asks questions")

## Idea
REON's per-cell switches are not only a control actuator. They are also a **measurement instrument**. Briefly loading or bypassing one cell (a short pulse or partial discharge) reveals its true state. Our contribution is **choosing which cells to probe, and when, by value of information (VoI)**. The goal is not to know every cell perfectly, but to know **just enough to make the right peak commitment**.

> Before a forecast peak, the twin asks: *"Most of my uncertainty about deliverable energy comes from these 5 cells, and only they affect tomorrow's commitment. Probe them, then commit."*

## What is known vs new
| Piece | Status | Source |
|---|---|---|
| Switching patterns add excitation that improves estimation: up to 46% for SoC and 78% for internal resistance | Known | MDPI *Batteries* 9(3):145 |
| Online SoH diagnostics inside reconfigurable batteries (e.g. from balancing currents) | Known | VDE proceedings |
| VoI / cost-aware test selection: "resolve just enough uncertainty to make the optimal decision" | Known in other fields (medical diagnosis, ML) | Kapoor & Horvitz (NIPS 2009); arXiv 1703.05452 |
| **VoI-driven probing of individual cells, tied to a peak energy commitment** | **Not found in our search** (limited search, so we say "to our knowledge") | none |

## Method (hackathon scope, about 2–3 h once the twin exists)
1. **Probe action:** probing cell *i* costs a small amount of energy (and time) and **reduces that cell's posterior variance** in the twin. Model this as a noisy capacity/resistance measurement with a known noise level, then run the Bayesian update.
2. **VoI of probing cell i:**
   $$ \text{VoI}_i = \mathbb{E}\big[\max_q \mathbb{E}[V(q,D)\mid \text{probe } i]\big] - \max_q \mathbb{E}[V(q,D)] $$
   Use greedy selection: probe the cell with the highest VoI − cost, update, and repeat until no VoI exceeds its cost.
3. **Compare three policies** under identical conditions:
   - **None:** no probing.
   - **Round-robin:** probe cells in a fixed order.
   - **VoI:** probe the cells with the highest VoI.
4. **Outputs:**
   - **$ value per probe**
   - **Probes needed to reach a target confidence**
   - the shift in the optimal commitment q* after probing

## Expected result (hypothesis)
VoI probing reaches the same commitment confidence with far fewer probes than round-robin, because uncertainty is concentrated in a few weak or uncertain cells. If VoI does not beat round-robin, report that honestly. It would mean uncertainty is spread evenly across cells.

## Why it matters to REON
- It is a **new product feature from existing hardware**, with no extra sensors.
- It completes the value decomposition: **physical value** (bypass) + **informational value** (tighter band) + **active information value** (probing).

---

# H. Data Sheet (researched 7 Nov 2026)

Status key: **V** = confirmed in a primary or official source; **S** = secondary coverage (press, vendor, or blog); **?** = conflicting or unverified.

## H1. Fixes to the PeakSure text
| PeakSure says | What we found | Action |
|---|---|---|
| Sterling: ~$17,000 from a **two-hour** discharge at a monthly peak | CESA/Clean Energy Group: $17,000 for **one hour**, Dec 2016. A resilient-power slide deck says two hours. **?** | Say "about $17,000 at a single monthly peak" without specifying the hours |
| Sterling: $244,460 from a two-hour annual-peak discharge | Only in a slide deck. Sandia/ESTAP (Mar 2018): **$240,660 actual annual-peak savings, $395,839 total, 2016 data**. **S** | Use $240,660 (Sandia) as the primary figure |
| Sterling system | 2 MW / 3.9 MWh Li-ion; >$1M cumulative savings by Apr 2019; MMWEC called the peak with "100% accuracy" (MMWEC release) **V** | Note: peak timing is already solved, which supports PeakSure's "energy, not timing" point |
| 41 MA municipal light plants | Not confirmed in our search **?** | Verify via MMWEC or the MA DPU before stating |
| West Boylston quote | Confirmed: GM Jonathan Fitch, 3 MW / 9 MWh, Convergent, operational 1 May 2026, shared-savings contract (pv magazine USA, May 2025) **V** | Keep |
| Lightshift: 6 projects, >23 MW, >$90M lifetime savings | Confirmed: 22 Jun 2026 release. Georgetown 3, Ipswich 5, Groton 4, Princeton 3.5, Ashburnham 3, Marblehead 5 MW; 8 more in development **V** | Keep |
| RNS "+~25% from 2024 to 2028" | RNS was $154 (2024), $185.28 (2025), $183.71 (2026) per kW-yr. July 2025 forecast: +$9, +$11, +$13, +$10 in 2027–2030, **"illustrative only"** **V** | 2024→2028 ≈ $154 → ~$204, about +32%. Say "rising roughly 25–30%" and cite ISO-NE |
| Peaker displacement as an environmental benefit | See E.3: roughly neutral on average **V** | Do not headline it |

## H2. Market and price data
| Item | Value | Status |
|---|---|---|
| MMWEC program savings | >$3.8M in 2024; $33.8M since 2017 | V (MMWEC) |
| Reading MLD battery | $346K net savings in first 19 months | V (MMWEC) |
| ISO-NE capacity (FCA) | $2.59/kW-mo (2025/26 and 2026/27); **$3.58/kW-mo (2027/28)**, +38% | V |
| Clean Peak Standard ACP (price ceiling) | $65/MWh (CY2026), $45 (2025); vendor estimate ~$32/kW-yr for a battery | S |
| ConnectedSolutions (MA) summer | $200–275/kW (sources conflict) | ? (check Mass Save) |
| Turnkey BESS, global avg 2025 | $117/kWh (BNEF via Energy-Storage.news) | S |
| Stationary pack avg 2025 | $70/kWh; lowest LFP cell $36, pack $50 | S (BNEF) |
| Na-ion cell 2026 | ~parity with LFP (~$50–60/kWh); CATL targets parity by end-2026 | ? (blog-quality) |
| Second-life | Repurposing $25–49/kWh; sale price $44–180/kWh; second-life BESS upfront cost 64–79% of new, but LCOS $234–278 vs $211/MWh for new (UC Davis 2021) | V (dated 2019–21) |

**Insight for the cost section:** with stationary packs at ~$70/kWh, second-life is losing its price edge (IDTechEx says the same). This **strengthens** PeakSure's choice to focus on certainty and value rather than "cheap second-life".

## H3. Competitors
| Company | What | Claims | Status |
|---|---|---|---|
| Relectrify (AUS) | CellSwitch: per-cell control + inverterless AC | Up to 30% lower electronics cost vs standard BMS; ~30% longer life; IEC-certified ReVolve (second-life Nissan Leaf); CEO calls them "premium systems" | S (company/investors) |
| Dukosi (UK) | DKCMS chip-on-cell **monitoring** + C-SynQ contactless comms; per-cell V/T, synchronized; battery passport | Better SoC/SoH from synchronized data; in volume production | S. **Monitoring only, no control** |
| REON (Boston) | Per-cell power-electronics control, "dynamic redundancy", no second-life sorting | 2–4× usable capacity vs conventional | S (company site) |
| Chalmers (research) | Modelled reconfigurable EV packs | +~14 months life (80 kWh car); >20% in the best case; higher upfront cost | V (Nat. Commun. 17:5980, 2026; press) |

## H4. Physics data
| Item | Value | Status |
|---|---|---|
| **Nature Energy (brief paper):** Zhou, Bian et al. 2026, "Quantifying the impact of cell-to-cell inconsistency on EV battery degradation and utilization", DOI 10.1038/s41560-026-02131-5 | Field data from real vehicles over 3+ years: pack SoH reduced ~6.2% (cars) and 7.5% (buses) by inconsistency; **19.3% (cars) / 27.1% (buses) of energy unused** when the weakest cell retires; inconsistency small until ~170,000 km; pack life 18–23% shorter | S (press; check the paper) |
| New-cell variation | Capacity RSD <0.4%, resistance RSD ~2.5% (200+ Kokam cells); 5,473-cell study (An et al., *Sci. Rep.* 2016) | V |
| Second-life field system | 324 cells: lumped model overestimates SoH by up to 31%; 2 faulty cells | V (arXiv 2609.04487) |
| Retired module dispersion | σ ≈ 2.4% around ~95% SoH | V (arXiv 2507.14020) |
| Used HEV LFP reuse acceptance | 90–99% of cells, 75–94% of modules | S |
| LFP calendar aging | Naumann 2018 (see C); open data | V |
| LFP cycle aging | Wang et al. 2011, *JPS* 196:3942, form Q = B·exp(−Ea/RT)·Ah^z. Our recalled values (Ea ≈ 31.7 kJ/mol − 370.3·C, z ≈ 0.55) are **not confirmed by any source we could open** | ? use Naumann cycle data instead (TUM, Mendeley 6hgyr25h8d) |
| Bypass MOSFET losses | No clean % figure found. In a TUM modular battery study, MOSFET losses were <1% of total losses; switching 125 A into bypass dissipates ~276 µJ per event | S, so keep the switch loss as a 0.5–2% sensitivity range |
| Retired EV volume, 2030 | 100–120 GWh/yr retirements (IEA via review); second-life supply 112–227 GWh (McKinsey); 275 GWh (IDTechEx, high) | S (older forecasts) |

## H5. REON public data (website, patents)
| Item | Value | Source |
|---|---|---|
| Company | REON Technology, Inc., **Chelmsford, MA** (200 Turnpike Rd); founded 2022; CEO Simon Zhang, CTO Tim Ren (Greentown Labs) | reoncorp.com, Greentown Labs |
| Headline claim | "**2–3× more usable capacity**" via cell-level control (no baseline or test conditions given; an older page said 2–4×) | reoncorp.com |
| Positioning | "Chemistry agnostic"; vertically integrated HW + BMS + EMS; AI EMS for **peak shaving, backup, demand response, VPP**; isolates underperforming cells | reoncorp.com |
| **CESS** (container; the plan calls it "CES") | **2.5 MW / 5 MWh**, grid-scale. No voltage, chemistry, or efficiency published | reoncorp.com/hardware |
| OES / OES100 / OES300 | 60 kW / 250 kWh C&I; OES100 is **208 V and 480 V compatible**; OES300 = 2× OES100 | reoncorp.com/hardware |
| EBS Na+ / Li+ | 30 kW / 60 kWh rack; **Na+ claims 20,000 cycles**, −40 to +140 °F; Li+ has >2× the energy in the same footprint | reoncorp.com/hardware |
| MPS, FES | 7.5 kW / 10 kWh mobile; 25 kW / 50 kWh residential/small commercial | reoncorp.com/hardware |
| Patent US 2023/0341471 "Battery Performance Tracking Across Battery Cells" | Series cell **columns** in parallel; a column controller stores per-cell data and **predicts a per-cell capability metric** (possibly via NFC) | Justia |
| Other REON filings (Ren, Zhang) | Bypass switch and series switch that are mutually exclusive (dead-zone control); in-situ reconfiguration; hot-swap | Justia |

| **Per-cell monitoring** | "Monitor every cell at **100 Hz** with **sub-10 ms** response" | reoncorp.com/solutions |
| Balancing | **Active**, bidirectional (energy moved between cells, not burned) + automatic isolate/bypass without shutdown | reoncorp.com/solutions |
| Supported chemistries | Li-ion, Na-ion, solid-state, **second-life** | reoncorp.com/solutions |
| EMS / programs | Peak shaving, TOU, demand response, **VPP via CPower and Voltus**; **SMART** program and **ISO-NE demand response** (job posting) | reoncorp.com/solutions; career.com |
| Funding | Accelerator round, Sep 2023, Greentown Labs (Caplight; location data conflicts) | caplight.com |

**Proxy values (other vendors, NOT REON; use only as labelled assumptions):**
- Na-ion container example: 160 Ah cells, **1P416S**, 1,198 V nominal → about **400 cells in series per string** at the MW scale.
- LFP containers commonly run 768–1,088 V DC.
- So for the CESS, assume **~250–420 cells in series per string**, and run a sensitivity. This matches PeakSure's argument that "long strings → bypassing a few cells costs little voltage".

**Implications for PeakSure:**
- **Twin measurements:** per-cell voltage at 100 Hz is published, so our twin's measurement model is grounded. Assume voltage noise of a few mV and temperature ±1 °C (typical BMS AFE values; assumption) unless REON says otherwise.
- **Baseline fairness:** REON already does *active* balancing. Our "conventional" baseline should be **passive balancing (industry typical)**, and we should state this. Optionally add "conventional + active balancing" as a stronger baseline, so we do not overstate bypass gains.
- The "480 V container" in the plan is our inference. 480 V is published only for the OES100, so ask about the CESS.
- **Chemistry is probably Na-ion or Li-ion depending on the product.** Build the model for both.
- REON's own patent already does **per-cell capability prediction**. Our twin and confidence band are a natural extension of their IP: we add **calibrated uncertainty** and its $ value. Pitch it that way.
- Treat 20,000 Na+ cycles and "2–3×" as **company claims**. Our model will likely show a smaller, honest gain, and we should explain why (it depends on cell variability).
- Related prior art on control: Farakhor, Wu, Wang, Fang, "A Novel Modular, Reconfigurable BESS", *IEEE Trans. Transp. Electrification* (arXiv 2301.05168). Receding-horizon convex power allocation per cell, with a lab prototype. Cite it if we build Tier 3.

## H6. Still open
- Read the Nature Energy and Chalmers papers themselves (we have only press numbers).
- Confirm the "41 MLPs" figure, the ConnectedSolutions rate, and the exact marginal emission values (ISO-NE appendix spreadsheet, Sections 3.3.1–3.3.2).
- **Only these remain for Discord** (not public anywhere we searched): CESS chemistry, DC voltage and cells per string, N_min, bypass switch losses / round-trip efficiency, per-cell measurement accuracy, and any anonymized per-cell field data.

---

# PART II: Strengthening Pass (7 Nov 2026)

> Part II adds sections J–Z. Part I (§0–§I and §H) is preserved. Where Part II **corrects** Part I, the correction is stated explicitly and listed in the change log (§Z).
>
> **Status of results:** no experiment in this document has been executed yet. Every result table and figure below is a **placeholder**. Nothing here is proven until the code runs, with seeds and confidence intervals.

---

# J. Research Contribution and Novelty Boundaries

## J1. Primary research question
> **Can uncertainty-aware cell-level intelligence improve the reliability and economic value of battery energy delivery during critical grid peaks, compared with conventional battery management?**

The operational decision it serves: **how much energy (power × window) an MLP battery should commit to a forecast coincident-peak window**, given an imperfect estimate of what the battery can actually deliver.

## J2. Three distinct sources of value
| # | Value | Mechanism | Needs |
|---|---|---|---|
| V1 | **Physical** | Bypass/reconfiguration means the weakest cell no longer ends the discharge, so more energy is deliverable | REON switching hardware |
| V2 | **Informational** | A cell-level probabilistic twin gives a narrower, calibrated estimate of deliverable energy, so a larger commitment is safe | Per-cell measurements + inference |
| V3 | **Active information** | VoI-selected diagnostic probes shrink uncertainty in exactly the cells that matter to tomorrow's commitment | Switch-controlled probing (unconfirmed for REON hardware, see §P) |

How each is measured without double counting is in §M2.

## J3. What is established vs what is a hypothesis
| Statement | Status | Basis |
|---|---|---|
| Series strings are limited by the weakest cell | **Established** | Textbook; arXiv 2609.04487; Nature Energy 2026 (press: 19–27% of energy stranded) |
| Bypass/reconfiguration extends pack life | **Established (modelled)** | Chalmers, *Nat. Commun.* 17:5980 (2026), not yet validated in a vehicle fleet |
| Commercial Na-ion cells vary strongly cell to cell | **Established (peer-reviewed)** | Bahrke et al., *EES Batteries* 2 (2026) 1157: DC-resistance CoV **10.4–11.9%** vs 0.68–5.8% for Li-ion; capacity CoV 1.15%; in one test point, ageing ranged from **3.1% loss after ~5,100 EFC to 23.4% after ~3,450 EFC** |
| Initial DC resistance indicates Na-ion plating/ageing risk | **Supported, weak to moderate** | Same paper: r = −0.675 between R_DC and coulombic efficiency; cells with R_DC < 75 mΩ "relatively stable"; the authors say this does *not* allow reliable prediction alone |
| Switching excitation improves cell-parameter estimation | **Supported** | MDPI *Batteries* 9(3):145: up to 46% (SoC) and 78% (resistance) better |
| VoI-based test selection improves decisions | **Established in other domains** | Kapoor & Horvitz (2009); arXiv 1703.05452 |
| Chance-constrained commitment of storage | **Established** | Evans et al. (arXiv 1904.03505); Lunde et al. |
| **H1:** a cell-level twin stays calibrated longer than a pack-level estimate as cells diverge | **Hypothesis** | To be tested (§N) |
| **H2:** V2 (informational) is a material share of total value | **Hypothesis** | To be tested (§M) |
| **H3:** VoI probing beats round-robin and random probing at equal probe budget | **Hypothesis** | To be tested (§O) |
| **H4:** lower resting SoC for weak cells extends life without raising missed-peak risk | **Hypothesis, chemistry-dependent** | See §R; the Na-ion evidence is mixed |

## J4. Novelty boundary (what we will and will not claim)
- We do **not** claim novelty for bypass, Bayesian twins, VoI, or chance-constrained commitment individually. All of these exist.
- A combination alone is not novelty. Our claim is narrower, a **research question and measurement** that, to our knowledge, has not been reported:
  1. **The decomposition of cell-level value into physical, informational and active-information parts** for a coincident-peak commitment decision.
  2. **Decision-focused probing:** whether selecting cell diagnostics by their effect on the *commitment decision* (not on estimation accuracy) changes dollars at risk.
- Our literature search was limited (web search, not a systematic review). Every novelty statement carries **"to our knowledge"**.

---

# K. Technical Architecture

## K1. Components and their type
| Component | Type | Function | Inputs → Outputs |
|---|---|---|---|
| **Plant simulator** (`cells_true`) | Physics-based simulation | Ground-truth cells: equivalent-circuit model (OCV(SoC) + R0 + 1 RC), semi-empirical calendar + cycle ageing, thermal factor | Dispatch, ambient T → true V, I, SoC, SoH, R per cell |
| **Measurement model** | Simulation (noise injection) | What the BMS "sees": V, T, I with noise, quantization, and optional bias | True states → noisy measurements |
| **Ageing model** | Physics-informed semi-empirical, **parameters fit to data** | Calendar (SoC, T, √t) + cycle (Ah throughput, DoD, C-rate, T) fade | Fit to TUM Na-ion / Naumann LFP (§N4) |
| **Digital twin** (`cells_twin`) | **Probabilistic inference** (particle filter / Bayesian ensemble) | A posterior over each cell's capacity, resistance and ageing rate | Noisy measurements → posterior samples |
| **Deliverable-energy predictor** | Probabilistic inference + physics | Pushes the posterior through the tier's control logic to get a distribution of deliverable energy D (P5/P50/P95) | Posterior, tier → F_D |
| **Calibration layer** | Statistical validation (+ optional conformal recalibration) | Checks and corrects the interval coverage | Predicted quantiles vs realized D → coverage, recalibrated quantiles |
| **Commitment optimizer** | **Mathematical optimization** (stochastic / chance-constrained) | Picks power P and window W (energy q = P·W) to maximize expected savings, subject to a safety chance constraint | F_D, peak-timing distribution, tariffs → (P*, W*) |
| **VoI probe selector** | Bayesian decision analysis (greedy VoI) | Chooses which cells to probe before the peak | Posterior, probe model, costs → probe list |
| **Bypass / tier controller** | **Rule-based automation** (Tier 2) or optimization (Tier 3) | Decides active cells, respects N_min and the voltage window | Cell states → switch states |
| **Safety supervisor** | **Rule-based**, hard limits | Overrides everything: V/I/T limits, N_min, fallback mode | All of the above → allowed actions |
| **Economics engine** | Deterministic accounting + Monte Carlo | Savings, PSaR, NPV, break-even premium, EVPI | Hits/misses, tariffs → $ |
| **Dashboard** | UI (Streamlit) | Live demo plus precomputed fallback | Engine outputs → views |

**Machine learning in the strict sense** is limited to parameter fitting of the ageing model and the probabilistic twin (Bayesian learning from data). This is deliberate: with ~100 cells and sparse field data, probabilistic inference is more reliable and auditable than black-box ML. **No LLM is used.** No LLM component solves a problem here better than the methods above (see §Z).

## K2. Data flow (per Monte Carlo run)
```
config.yaml ──► population generator ──► cells_true[t0]
                                            │  (monthly loop, 15 yrs)
ISO-NE peak history ──► peak-timing model   ▼
                         │            plant simulator ──► true states
                         │                  │
                         │          measurement model ──► noisy obs
                         │                  │
                         │            digital twin (posterior)
                         │                  │
                         │       [optional VoI probes → obs → update]
                         ▼                  ▼
                   commitment optimizer ◄── F_D (deliverable-energy dist.)
                         │
                 safety supervisor ──► dispatch on peak window
                         │
                 plant delivers TRUE energy ──► hit/miss, shaved kW
                         │
                  economics engine ──► $, PSaR, NPV, EVPI
```
**Rule:** the optimizer never sees `cells_true`. Only the economics and evaluation code reads both.

## K3. Reproducibility
- Every run is defined by `config.yaml` + seed. Results are saved as parquet/JSON with the config hash and git commit.
- Fixed seed sets: `seeds = 0..N-1`. The same seeds are reused across tiers (**common random numbers**), so differences between tiers are not noise.
- Computation time is logged per scenario (wall-clock, CPU, number of runs).

---

# L. Experimental Hypotheses (pre-registered before running)

| ID | Hypothesis | Test | Falsified if |
|---|---|---|---|
| H1 | Cell-level twin coverage of the P5 quantile stays within [3%, 7%] longer than a pack-level estimate as cell variability grows | §N, coverage vs year × ε | Cell-level coverage is no better than pack-level |
| H2 | V2 (informational) > 0 with a 95% CI excluding 0 at realistic variability | §M2 decomposition | CI includes 0 |
| H3 | At an equal probe budget, VoI probing yields higher expected savings than round-robin and random | §O | Not significantly better at any budget |
| H4 | Under systematic twin bias (ε_bias ≥ 20%), probing *without* bias correction can reduce sharpness without improving coverage | §O4 | Probing improves coverage under bias too |
| H5 | REON advantage (B, C vs A) grows with cell variability and battery age | §M sweep | Advantage flat or negative |
| H6 | Lower resting SoC for weak cells extends life without raising the missed-peak rate (LFP; Na-ion at warm temperatures) | §R | Life gain within CI of 0, or missed-peak rate rises |

H4 is a *negative-control* hypothesis. We expect probing to have limits, and we test for them.

---

# M. Benchmark: Baselines, Proposed Methods and Metrics

## M1. Conditions
| ID | Hardware | State information | Commitment rule | Probing |
|---|---|---|---|---|
| **A** | Fixed string (passive balancing) | Pack-level estimator (BMS-style: min-cell limited, pack SoH) | Fixed rule: commit P95 of the pack estimate (or a fixed derate) | None |
| **B** | Cell bypass (Tier 2) | Pack-level estimator | Same fixed rule as A | None |
| **C** | Cell bypass | **Cell-level probabilistic twin** | **Optimized** chance-constrained commitment | None |
| **D** | Cell bypass | Cell-level twin | Optimized | **VoI probing** |

Identical across conditions:
- initial cell populations (same seeds)
- datasets and ageing parameters
- peak-event sequence (ISO-NE history)
- physical limits
- economic assumptions

## M2. Avoiding double counting: a factorial design
C differs from B in **two** ways: information (twin) **and** decision rule (optimizer). To separate the effects, we also run:

| Extra condition | Hardware | Information | Rule |
|---|---|---|---|
| A-twin | Fixed string | Cell twin | Optimized |
| B-opt | Bypass | Pack estimate | Optimized |

Then, with V(·) = expected annual savings:
- **Physical value V1** = Shapley average over information levels:
  ½[(V(B-opt) − V(A-opt)) + (V(C) − V(A-twin))], where A-opt is A with the optimized rule.
- **Informational value V2** = ½[(V(A-twin) − V(A-opt)) + (V(C) − V(B-opt))]
- **Decision-rule value** = V(B-opt) − V(B), reported **separately** (it is not cell-level intelligence).
- **Active information value V3** = V(D) − V(C), net of the probe energy cost.
- **Interaction term** = V(C) − V(A-opt) − V1 − V2 (≈ 0 by Shapley construction; report it anyway).

This gives V1 + V2 + V3 + rule value = total gain from A to D, **with no benefit counted twice**.

## M3. Metrics (all reported with 95% CIs over seeds)
| Metric | Unit | Definition |
|---|---|---|
| Deliverable energy | kWh | True energy deliverable at the peak, per tier, per year |
| Peak delivery success rate | % | Share of monthly and annual peaks where the committed P was held through the actual peak hour |
| Coverage | % | P(D_true < predicted P5); target 5% |
| Sharpness | kWh | Width of the P5–P95 interval |
| Expected savings | $/yr | Σ over peaks of rate × shaved kW at the actual peak hour |
| PSaR | $/yr | E[savings ∣ perfect delivery] − P5(realized savings) |
| NPV | $ | §Q |
| Break-even premium | $/kWh | §Q |
| EVPI | $/yr | §B |
| Computation time | s | Wall-clock per scenario; per-decision latency for the optimizer and VoI |
| Sensitivity | — | All of the above vs cell variability (CoV), battery age (years), ε |

## M4. Statistics
- N ≥ 200 Monte Carlo seeds per scenario for final results (100 during development).
- Paired differences between tiers (common random numbers) with **bootstrap 95% CIs**.
- Coverage with **Wilson 95% intervals** (a binomial count of misses).
- **No improvement is reported unless its CI excludes 0.** Everything else is reported as "no detectable difference".

---

# N. Digital Twin Calibration Protocol

## N1. Two systems
- **Ground truth (`cells_true`)**: the simulated plant. **It is not real hardware.** All "accuracy" is accuracy against a simulator whose physics we chose.
- **Twin (`cells_twin`)**: receives only noisy, incomplete measurements:
  - V and T at 100 Hz, aggregated to the time step;
  - no direct access to capacity or ageing parameters.

## N2. Mismatch levels
ε ∈ {0, 10, 20, 30%} applied to the twin's ageing model, in two modes:
- **Random:** per-cell multiplicative noise on ageing coefficients, with mean 1.
- **Systematic:** a bias. The twin underestimates the fade rate by ε, which is the dangerous direction.

Optionally, also apply a structural mismatch: the twin uses a calendar-only model while the plant has cycle + calendar ageing.

## N3. Calibration metrics
- P5 coverage (target 5%, Wilson CI), and full reliability diagrams (nominal vs observed for 5–95% quantiles).
- CRPS (continuous ranked probability score) for overall probabilistic accuracy.
- Coverage **over battery age** (years 1–15), since H1 concerns divergence over time.
- **Recalibration option:** split-conformal adjustment of quantiles on a calibration subset of seeds, evaluated on held-out seeds.

## N4. Out-of-sample validation with measured data (where the datasets permit)
- **Na-ion (TUM, Bahrke et al. 2026):** 70 aged cells across test points.
  - Fit ageing parameters on a subset of test points.
  - Predict the held-out test points (leave-one-test-point-out).
  - Report the error and the interval coverage.
  - Because ageing varies so much within a single test point, also report **the within-test-point spread the model fails to explain**. This is direct evidence for why per-cell uncertainty is needed.
- **LFP (Naumann et al. 2018):** fit on the static calendar test points; validate on the paper's **dynamic** validation profiles. The original paper reports <2.2% capacity error, which is our benchmark to match.
- **Status: not yet done.** Only the Na-ion paper PDF is downloaded (`data/d6eb00020g.pdf`). The datasets themselves are not processed. A dataset link is **not** evidence that it was used.

## N5. What calibration does not show
Calibration on simulated truth shows that the *inference* is internally consistent. It does **not** show that the plant model matches real REON hardware. Field validation needs REON's per-cell data.

---

# O. VoI Diagnostics: Full Protocol (extends §I)

## O1. Probe model (simulated capability)
A probe on cell *i* is a short current step: the cell is switched into or out of the string, or driven by the active balancer. From ΔV/ΔI we get a resistance estimate R̂_i with noise σ_R. A longer partial-discharge probe gives a capacity estimate Ĉ_i with noise σ_C.

Costs per probe:
- energy (a small kWh loss and balancing loss);
- time (probes must finish before the peak window);
- an optional wear penalty.

**Why resistance is a useful probe target:** in the TUM Na-ion data, initial R_DC correlated with plating behaviour (r = −0.675 with coulombic efficiency), and cells with R_DC < 75 mΩ were relatively stable. A resistance probe therefore carries information about *future* risk, not only about the current state. This is supportive, not conclusive (the authors caution against using it alone).

## O2. Policies (same probe budget k)
1. **None**
2. **Round-robin:** cycle through cells in a fixed order
3. **Random:** uniform selection
4. **VoI:** greedy. At each step, probe the argmax over cells of [VoI_i − cost_i], where VoI_i = expected improvement in the optimized commitment value after observing cell i (§I formula). Estimate it by preposterior simulation over the particle set.

## O3. Metrics
- Probing cost: kWh and $.
- Number of probes needed to reach a target P5 coverage or sharpness.
- Reduction in predictive uncertainty: width of the P5–P95 interval of D.
- Change in the optimal commitment q* (kWh), and how often the decision changes.
- Expected economic value of the information: Δ expected savings net of probe cost.
- Computation time of the VoI selection (it must finish within the pre-peak window).

## O4. Robustness tests (probing is NOT assumed to help)
- **Noisy probes:** σ_R and σ_C swept from small to large. Expected: VoI collapses toward 0 as noise grows.
- **Systematic bias:** the probe has a bias the twin does not know about (e.g. a resistance offset). Test whether probing *worsens* coverage by making the twin confidently wrong (H4).
- **Uniform uncertainty:** all cells equally uncertain. Expected: VoI ≈ round-robin, which is a sanity check.
- Report all cases, including null results.

## O5. Hardware status
REON publicly states per-cell 100 Hz monitoring, automatic isolation/bypass, and bidirectional active balancing (§H5). These make probing **plausible**. **It is not confirmed** that the CESS can execute deliberate diagnostic current steps on a single cell during operation. **Until REON confirms it, probing is labelled a "simulated capability" in all outputs and in the pitch.**

---

# P. Hardware Feasibility and Engineering Constraints

## P1. Constraints in the simulator
| Constraint | Model | Value | Status |
|---|---|---|---|
| Cell voltage window | V_min ≤ V_cell ≤ V_max per cell | Na-ion ~1.5–4.0 V; LFP 2.5–3.65 V (typical datasheet ranges) | **Assumed** (chemistry unconfirmed) |
| Cell current limit | ∣I∣ ≤ I_max (C-rate) | ~1C continuous for a 2 h system | Assumed |
| **String voltage vs inverter DC window** | V_inv,min ≤ Σ_active V_cell ≤ V_inv,max. **This defines N_min (and N_max)** | N_series 250–420 (proxy); window from proxy datasheets | **Assumed, ask REON** |
| Minimum active cells | N_active ≥ N_min per string | Derived from the line above | Assumed |
| Inverter/PCS | P ≤ 2.5 MW (CESS rating); ramp rate; efficiency curve | 2.5 MW confirmed; the rest assumed | Partly confirmed |
| Switching losses | Conduction I²·R_ds(on) per active switch + per-transition energy (~276 µJ at 125 A, literature) | Total 0.5–2% of throughput (sensitivity) | Assumed |
| Temperature | T_min ≤ T_cell ≤ T_max; ageing via Arrhenius; winter derate | Na-ion keeps 51–62% of its 25 °C capacity at −40 °C (Leeds, *Appl. Energy* 2026) | Literature; **cold-weather ageing assumed** |
| Degradation limit | End of life at 70–80% of initial usable energy | Parameter | Assumed |
| Measurement | V at 100 Hz (REON claim); noise ~few mV, T ±1 °C | 100 Hz confirmed (website); noise assumed | Partly confirmed |
| Diagnostic energy | Per-probe kWh drawn from the commitment budget | Parameter | Assumed |

## P2. Safe fallback behaviour (rule-based, always on)
1. **Hard limits override the optimizer.** The safety supervisor clips any action that would breach V/I/T, N_min, or the inverter window.
2. **Calibration watchdog.** If recent realized D falls below P5 more often than the Wilson upper bound allows, switch to **conservative mode**: commit P99 of the pack-level estimate (the Baseline B rule).
3. **Twin divergence.** If the twin's predicted voltage misses the measured value by more than k·σ for a cell, flag the cell, widen its uncertainty, and exclude it from the commitment.
4. **Anomalous cell** (e.g. suspected plating: low CE, abnormal heating). Bypass it permanently and alert. This is the Na-ion failure mode reported by TUM.
5. **No probing within X minutes of a peak**, and never on flagged cells.

**The simulator does not prove hardware safety.** It checks that the *logic* respects modelled limits. Safety certification needs hardware testing (UL 9540/9540A-type processes are outside our scope).

## P3. Confirmed vs assumed (REON)
- **Confirmed (public):**
  - CESS 2.5 MW / 5 MWh
  - per-cell monitoring at 100 Hz, <10 ms response
  - automatic isolate/bypass
  - bidirectional active balancing
  - support for Li/Na/second-life chemistries
  - per-cell capability-prediction patent (US 2023/0341471)
- **Not confirmed:**
  - CESS chemistry
  - DC voltage and cells per string
  - N_min
  - switch losses and efficiency
  - measurement accuracy
  - **independent per-cell SoC holding at rest** (needed for Tier 3)
  - **diagnostic probing on demand** (needed for D)

---

# Q. Economic Validation

## Q1. The business case in five answers
| Question | Answer |
|---|---|
| **Who buys PeakSure?** | The battery owner. Either the MLP itself, or the third-party owner/operator under a shared-savings contract (e.g. Convergent at West Boylston; Lightshift with MMWEC). REON could also bundle it with the CESS as a software layer. |
| **Who operates?** | MMWEC runs peak forecasting and remote dispatch for its members. The owner/operator runs the battery. PeakSure sits between the battery data and the dispatch decision. |
| **What decision improves?** | For each forecast peak: **what power P over what window W to commit**, given uncertain deliverable energy. A wider window catches more uncertain peaks but needs more energy. |
| **Why REON hardware matters** | (1) Bypass raises deliverable energy (V1). (2) Per-cell data enables a calibrated cell-level twin (V2). (3) Switches may enable targeted probes (V3, unconfirmed). |
| **Why existing tools don't fully solve it** | Peak-*timing* forecasting is mature (MMWEC reported calling Sterling's peaks with "100% accuracy" in 2019). Conventional BMS/EMS report a pack-level SoC/SoH point estimate. We found no public product that gives a **calibrated probability of delivering a committed energy over a window, built from cell-level states**. To our knowledge; this is not an exhaustive market survey. |

## Q2. Formulas (units explicit)
Per peak event *e* with the actual peak hour h_e:
```
shaved_kW(e) = P_committed  if the battery is still discharging at h_e
                            (true deliverable energy ≥ energy used up to h_e,
                             and h_e ∈ window W)
             = 0            otherwise

Monthly transmission saving (RNS):  S_RNS(e) = shaved_kW(e) × RNS_rate/12     [$/kW-yr → $ per monthly peak]
Annual capacity saving:             S_cap    = shaved_kW(annual peak) × FCA_price × 12   [$/kW-mo × 12 → $/yr]
Annual savings:                     S_yr     = Σ_months S_RNS + S_cap
Missed-peak cost:                   L(e)     = rate_e × P_committed   (savings lost when the battery runs short)
NPV                                 = Σ_t (S_t − O&M_t)/(1+r)^t − CAPEX − Σ replacements/augmentation_t/(1+r)^t
Break-even premium [$/kWh]          = (NPV_REON − NPV_conv) / E_nameplate
Value of information                = EVPI (§B), and V2 and V3 from §M2
```

## Q3. Worked upper-bound example (simple arithmetic, not a model result)
Assume a 2.5 MW CESS shaves the full 2.5 MW at every peak:
- RNS (2026): $183.71/kW-yr ÷ 12 = **$15.31 per kW per monthly peak**, giving 2,500 kW × $15.31 ≈ **$38.3K per monthly peak**, ≈ **$459K/yr** for all 12.
- Capacity (FCA 18, 2027/28): $3.58/kW-mo × 12 = **$42.96/kW-yr**, giving ≈ **$107K/yr** from the annual peak.
- **Upper bound ≈ $566K/yr.** This is before misses, partial shaving, losses, and any MLP-specific tariff structure (MMWEC pass-throughs, other transmission components), so treat it as an **upper bound**.

## Q4. Correction to Part I and PeakSure
1. **Sterling's 2016 annual-peak saving ($240,660 for ~2 MW ≈ $120/kW-yr) is about 2.8× today's capacity value ($43/kW-yr).** Capacity prices in that era were likely higher; we did not verify which FCA period applied. **Do not extrapolate Sterling's per-peak values to 2027.** Compute from current rates (Q3).
2. **At current rates, the 12 monthly RNS peaks (~$459K/yr) are worth about 4× the annual capacity peak (~$107K/yr).** PeakSure's line "one missed annual peak can wipe out a year's capacity savings" is still true, but **monthly transmission peaks dominate the money**. The headline should be "13 peaks a year", not "one hour a year".
3. Because peak *timing* is uncertain, operators typically dispatch on several candidate days per month. **Cycling is therefore more frequent than 13 per year.** The number of dispatch days per year is an **assumption** (sensitivity 20–80), and it matters for the calendar-vs-cycle ageing balance (§R).

## Q5. Real data vs assumptions
| Parameter | Value | Class |
|---|---|---|
| RNS rate | $183.71/kW-yr (2026) | Verified (ISO-NE) |
| RNS 2027–30 increments | +$9/+11/+13/+10 per kW-yr | Verified but "illustrative only" |
| FCA price | $3.58/kW-mo (2027/28) | Verified (secondary, consistent) |
| CESS rating | 2.5 MW / 5 MWh | Verified (REON site) |
| Pack / turnkey price | ~$70 / ~$117 per kWh (2025) | Secondary (BNEF via press) |
| REON premium | Unknown → **solved for** as break-even | Derived |
| Discount rate | 7–8% | Assumed |
| Dispatch days/yr | 20–80 | Assumed |
| O&M | % of CAPEX | Assumed |
| MLP tariff pass-through details | — | **Unverified; ask MMWEC/REON** |

---

# R. Lifetime and Sustainability (extends §C, §E)

## R1. Calendar vs cycle ageing for a peak-shaving battery
With 20–80 dispatch days per year (§Q4), annual throughput is low. **Calendar ageing likely dominates**, so the resting state (SoC, temperature) matters more than the cycling depth. The simulator logs the calendar and cycle contributions separately.

## R2. Tier 3 (lower resting SoC for weak cells): evidence is chemistry-dependent
- **LFP:** calendar fade increases with storage SoC and temperature (Naumann et al. 2018). Lower resting SoC is plausibly beneficial.
- **Na-ion (TUM 2026), more nuanced:**
  - At **45 °C**, there is a clear trend: higher storage SoC gives faster degradation (10% lowest, 90% highest).
  - At **25 °C**, there is **no clear correlation**; cell-to-cell variation dominated.
  - Anode active-material loss was **highest at 10% SoC** (at 45 °C).
  - **So "lower is better" is not established for Na-ion at moderate temperatures, and very low SoC may harm the anode.**

**Correction to Part I:** §C said the lever "plausibly applies to Na-ion too". Revised: Tier 3 for Na-ion should target a **moderate** resting SoC (e.g. 30%), not a minimal one, and is justified mainly for **warm** conditions. At 25 °C the expected benefit is uncertain.

**Feasibility gate:** Tier 3 runs only if REON confirms per-cell SoC can be held independently at rest (via active balancing or bypass). Otherwise it is reported as a hypothetical upper bound.

**Readiness trade-off:** weak cells must be recharged before forecast peaks. A missed forecast means less energy available. We measure the missed-peak rate with and without Tier 3 (H6).

## R3. Quantities reported
| Quantity | Unit |
|---|---|
| Lifetime delivered energy | MWh over 15 years |
| Capacity fade | % per year; years to end of life |
| Replacement/augmentation avoided | kWh and year of augmentation |
| Oversizing avoided to match the REON P5 deliverable energy | kWh |
| Embodied CO₂e avoided | t CO₂e, using the 31–92 kg/kWh band (LFP) and the Na-ion ranges in §E |
| gCO₂e per delivered kWh | g/kWh |
| Sensitivity | All of the above vs ageing-parameter uncertainty (posterior spread from the fits in §N4) |

## R4. Grid CO₂
**Not assumed to fall** (§E.3). It is reported only as a scenario, using ISO-NE marginal rates for the actual dispatch hours, with round-trip losses included.

---

# S. Minimum Winning Demo (under 2 minutes)

## S1. Script
| Time | Screen | Narration |
|---|---|---|
| 0:00–0:15 | Title + one number (Q3 upper bound; the real number from the model) | "Massachusetts towns save money by shaving 13 peaks a year. The question is whether the battery delivers when it counts." |
| 0:15–0:35 | **Cell map**: ~100 cells coloured by SoH, at year 8 | "Cells drift apart. In a fixed string, the weakest cell ends the discharge." |
| 0:35–0:50 | **Forecast peak window** on the ISO-NE load curve | "Tomorrow's likely peak is 4–7 pm." |
| 0:50–1:10 | **Conventional vs REON**: deliverable-energy bars, side by side | Actual model output for Tier 1 vs Tier 2 |
| 1:10–1:30 | **Twin interval** (P5/P50/P95) + **optimized commitment** (P*, W*) | "PeakSure commits only what it can deliver with 95% confidence." |
| 1:30–1:45 | **Optional VoI probe**: highlight 3 cells, the interval tightens, q* moves | "Labelled *simulated capability*." |
| 1:45–2:00 | **Comparison table**: success rate, $ saved, PSaR, break-even premium | Model outputs with CIs |

## S2. Rules
- Every number on screen comes from the engine. **No hardcoded improvement percentages.**
- Show the seed and config hash in the footer.
- Show the assumption flags (confirmed/assumed) in an "Assumptions" drawer.

## S3. Fallback
- Precompute 3–5 scenarios (low/medium/high variability; ε = 0/20%), saved as parquet with config + seed.
- The dashboard has a **"Replay saved scenario"** mode that works offline.
- Also keep a screen recording.

---

# T. Expected Figures and Result Tables (placeholders: NO RESULTS YET)

**Figures**
1. **F1:** Deliverable energy vs year (P5/P50/P95 bands) for A, B, C. *[placeholder]*
2. **F2:** Reliability diagram (nominal vs observed coverage) for pack-level vs cell-level, at ε = 0/10/20/30%. *[placeholder]*
3. **F3:** P5 coverage vs battery age. *[placeholder]*
4. **F4:** Value decomposition waterfall: A → +rule → +V1 → +V2 → +V3 = D. *[placeholder]*
5. **F5:** Expected savings vs probe budget for none/round-robin/random/VoI, with CIs. *[placeholder]*
6. **F6:** Tornado chart of the break-even premium. *[placeholder]*
7. **F7:** REON advantage vs cell variability CoV × age heatmap. *[placeholder]*
8. **F8 (P2):** Lifetime MWh and capacity fade, Tier 2 vs Tier 3. *[placeholder]*

**Table T1: Main benchmark** (mean [95% CI], N seeds)

| Metric | A | B | C | D |
|---|---|---|---|---|
| Deliverable energy, yr 10 (kWh) | — | — | — | — |
| Peak success rate (%) | — | — | — | — |
| P5 coverage (%) | — | — | — | — |
| Expected savings ($/yr) | — | — | — | — |
| PSaR ($/yr) | — | — | — | — |
| NPV ($) | — | — | — | — |
| Compute time (s/scenario) | — | — | — | — |

**Table T2: Value decomposition** ($/yr, 95% CI): rule — V1 — V2 — V3 — interaction — total. *[placeholder]*

**Table T3: Probing** (k = 1, 3, 5, 10): Δ interval width, Δq*, net $ — per policy. *[placeholder]*

---

# U. Evidence and Assumption Audit

Classes: **[V]** verified from an original source · **[PR]** peer-reviewed literature · **[M]** from our implemented model (none yet) · **[A]** assumed for simulation · **[U]** unverified / needs REON

| # | Claim | Class | Note |
|---|---|---|---|
| 1 | CESS is 2.5 MW / 5 MWh | V | reoncorp.com/hardware |
| 2 | REON monitors every cell at 100 Hz, <10 ms | V (company claim) | Not independently tested |
| 3 | REON gives "2–3× more usable capacity" | U | Company claim, no baseline |
| 4 | CESS chemistry, string size, N_min, losses | U | Ask REON |
| 5 | Per-cell probing on demand | U | Simulated capability |
| 6 | Independent per-cell resting SoC | U | Tier 3 gate |
| 7 | Weakest cell limits a series string | PR | Multiple sources |
| 8 | 19.3% / 27.1% of energy stranded (Nature Energy 2026) | U (press only) | **Read the paper before using it in the pitch** |
| 9 | Bypass +~14 months / >20% life (Chalmers) | PR (press-read) | Modelled, EV context |
| 10 | Na-ion R_DC CoV 10.4–11.9%; capacity CoV 1.15% | PR | Read directly from the PDF |
| 11 | Na-ion ageing spread 3.1% vs 23.4% in the same test point | PR | Read directly from the PDF |
| 12 | Na-ion calendar: SoC trend clear at 45 °C, not at 25 °C | PR | Read directly; corrects Part I §C |
| 13 | RNS $183.71/kW-yr (2026) | V | ISO-NE presentation |
| 14 | FCA $3.58/kW-mo (2027/28) | V (secondary, consistent) | |
| 15 | Monthly RNS peaks ≈ 4× annual capacity value | M-arith (simple arithmetic) | Q3; not a model result |
| 16 | Sterling $240,660 annual-peak saving (2016) | V (Sandia/ESTAP slides) | Not representative of 2027 prices |
| 17 | Sterling $17K per monthly peak: 1 h vs 2 h | U (sources conflict) | Avoid the duration |
| 18 | "41 MA MLPs" | U | Not found |
| 19 | ISO-NE marginal CO₂ ≈ 700 lb/MWh, on-peak ≈ off-peak | V (read from a figure) | Approximate reading |
| 20 | LFP manufacturing 31–92 kg CO₂e/kWh | PR / secondary | Band, not a point |
| 21 | Stationary pack ~$70/kWh | Secondary (BNEF via press) | |
| 22 | Switch losses 0.5–2% | A | Sensitivity |
| 23 | Measurement noise, a few mV | A | Typical BMS AFE |
| 24 | Dispatch days 20–80/yr | A | Sensitivity |
| 25 | Wang 2011 LFP parameters | U | Not used; Naumann instead |
| 26 | Any % improvement of PeakSure over baseline | **Not yet available** | No experiment run |

**Units check (corrections made):**
- RNS is in $/kW-**yr** and is charged on monthly peaks, so each monthly peak is worth RNS/12 per kW.
- FCA is in $/kW-**month**, so the annual value is ×12.
- Energy commitment q [kWh] = P [kW] × W [h].
- CO₂ figures are per kWh of **cell capacity** (manufacturing) vs per MWh of **energy delivered** (grid); never mix them.

---

# V. Critical Risks and Limitations

1. **Small effect size.** Cells start out similar (Nature Energy: divergence after high mileage), so the REON advantage may be small in years 1–5. *Mitigation:* report it by age, and test augmentation/second-life (P2) where divergence is larger from day 1.
2. **"Just oversize" objection.** At ~$70/kWh, 10% extra capacity is cheap. *Mitigation:* the break-even premium and "oversizing avoided" answer this directly, even if the answer goes against us.
3. **Simulated ground truth.** Calibration is against our own simulator. *Mitigation:* out-of-sample fits on TUM/Naumann data (§N4), and state the limit clearly.
4. **Unconfirmed hardware capabilities** (probing, per-cell SoC hold). *Mitigation:* label them "simulated capability"; P0 does not depend on them.
5. **Tariff simplification.** Actual MLP cost pass-through is more complex. *Mitigation:* treat Q3 as an upper bound, and compute ranges.
6. **Na-ion unpredictability** (plating). This is both a risk to model accuracy and an argument for the product.
7. **Scope.** P1/P2 must not endanger P0 (§X).

---

# W. Questions for REON (consolidated, by priority)
1. CESS chemistry and cell format/capacity?
2. DC bus voltage window, cells in series per string, strings per container, and N_min?
3. Bypass switch losses / round-trip efficiency, with vs without bypass?
4. Per-cell measurement accuracy (V, T, current?) and the data available to customers (API, logging rate)?
5. **Can a single cell be driven with a deliberate diagnostic current step during operation?** (decides whether V3 is real or simulated)
6. **Can different cells be held at different SoC at rest?** (decides Tier 3)
7. Typical MLP duty cycle: peak-only, or stacked with ConnectedSolutions/Clean Peak/arbitrage? How many dispatch days per year?
8. Can new cells be mixed into aged strings (augmentation)?
9. Any anonymized per-cell field data (capacity/resistance spread vs age)?
10. **Temperature:** what are the CES cell charge/discharge temperature limits and derating thresholds? What is the typical **cell-to-cell temperature spread inside a container** on a ~95 °F afternoon? Does the CES use HVAC or liquid cooling?

---

# X. Prioritized Implementation Roadmap

## P0: Must work for submission
| Task | Owner | Done when |
|---|---|---|
| Config + data contract; `cells_true` / `cells_twin` separation | All | Repo, config, shapes agreed |
| Population generator + Tier 1/2 controllers + 16-cell test | CS1 | Test passes |
| Ageing loop (calendar + cycle), parameters from the literature (fits if time allows) | CS1 | 15-year bands plotted |
| Basic twin (particle/ensemble) + deliverable-energy distribution | CS2 | P5/P50/P95 per tier |
| Chance-constrained commitment (P, W) + hit/miss on ISO-NE peaks | Econ | Hit rate per tier |
| Economics: savings, PSaR, NPV, break-even (Q2) with real rates | Econ | One end-to-end number |
| Baselines A, B, C with common random numbers, CIs | CS1 + Econ | Table T1 filled |
| Dashboard (5 views) + saved-scenario fallback | CS2 | Teammate test passes |
| Assumption flags in the UI + audit table | Deck | Matches §U |

## P1: High-impact scientific differentiator
- Calibration + mismatch experiments (ε 0–30%, random + systematic): F2, F3
- Value decomposition (factorial §M2): F4, T2
- VoI probing (4 policies, robustness tests): F5, T3
- Out-of-sample validation on TUM / Naumann data

## P2: Optional research extensions
- Tier 3 lifetime-aware control (gated on REON confirmation)
- Mixed-age augmentation / second-life scenarios
- Deeper sustainability analysis (grid-CO₂ scenario, Na-ion vs LFP LCA)
- Additional chemistries
- Fleet-level aggregation (prior art exists; scaling slide only)

**Rule:** no P1/P2 work starts until the P0 end-to-end run produces Table T1 with CIs.

---

# Y. Technical Pitch for REON Judges (~45 s)

> "Massachusetts municipal utilities save hundreds of thousands of dollars a year by shaving 13 grid peaks: 12 monthly transmission peaks plus the annual capacity peak. Peak *timing* is already forecast well. What nobody quantifies is how much energy the battery can *actually* deliver in that window, and that uncertainty grows as cells drift apart.
>
> PeakSure runs on REON's cell-level data. A probabilistic digital twin of every cell turns per-cell measurements into a calibrated deliverable-energy range. An optimizer commits only what the battery can deliver with a chosen confidence, and REON's bypass keeps weak cells from ending the discharge.
>
> We separate three sources of value: physical (bypass), informational (the twin), and active information (targeted cell probes, a simulated capability we'd like to validate with you). We test each against conventional management using real ISO-NE rates and public ageing data. The output is a dollar figure: savings protected, oversizing avoided, and the break-even premium REON's hardware can command. [Numbers from Table T1, with confidence intervals.]"

---

# AA. Official Brief: What It Changes (read 7 Nov, from the team Drive)

Source: `data/brief/Challenge_Brief.pdf` ("Beyond the Weakest Cell: Making Every Cell Count", REON hacker supplementary brief, 4 pp.) and `data/brief/REON_WHO_WE_ARE.pdf`.

| Brief says | Impact on PeakSure |
|---|---|
| **Teams can assume** individual-cell monitoring of V, T, SOC, SOH, capacity, resistance, OCV and history; and switching/selective bypass that can **include or remove any cell, chosen by us, subject to system limits**. No need to design hardware or low-level control. | (1) **Probing (V3) is within the stated capabilities**: switching a cell in or out *is* a current step. Upgrade from "simulated capability" to **"within REON's stated hackathon capabilities; physical execution and accuracy unconfirmed"**. (2) Per-cell SOH/capacity/resistance are *provided*, but in reality they are estimates. We model them as **reported values with estimation error**, and state this as our modelling choice. |
| Decisions should use **delivered energy (kWh) and power (kW) at a defined system boundary**, not Ah | Already our unit choice (§Q2). Define the boundary as the **AC side of the CES inverter (480 V 3φ)**. |
| A 70% retention threshold is typical for stationary use; it depends on duty, warranty and service obligation | Use 70% as the default EOL, with 80% as a sensitivity. |
| Nature Energy 2026: "its EV results are **not performance claims for REON or for stationary storage**" | **Correction:** use the 19–27% figure only as *EV-fleet evidence that inconsistency matters*, never as a PeakSure or REON number. |
| The 16-cell example: 15 × 85 Ah + 1 × 70 Ah gives a fixed string of 70 Ah vs a 84.06% average; the "sum" upper bound is conceptual, because the series voltage must stay valid | Our 16-cell unit test (Plan, Phase 1) must reproduce 70 Ah and 84.06%, and must show that the bypass result **is bounded by N_min**, not by the plain sum. |
| Asks for a specific application, a clear baseline, at least one quantified economic/environmental outcome, and sensitivity | Matches §M, §Q, §R and the tornado chart. |

**REON product facts (WHO_WE_ARE.pdf):**
- **CES (Containerized Energy System): 2.5 MW / up to 5 MWh, 480 V 3φ AC.**
  - The plan's "480 V" is correct as the **AC** interface. The DC string voltage is still unknown.
  - The PDF calls it "CES"; the website says "CESS". PeakSure's naming was right.
- Certifications across the product line: UL 1741 / 1973 / 9540 / 9540A.
- EBS is marketed as the "world's first UL-certified sodium-ion BESS", with a wide temperature range.
- Claim: "2–4× performance" (company claim).

# AB. External Analysis in the Drive: "Lot Desk" deck (`deck.pdf`)

An 8-slide independent analysis of a different application: a second-life integrator, 30 kW / 60 kWh, 208 V cabinet. Its findings are directly relevant as a **warning**:
- At the base design, the **median value ceiling for module electronics is about $0/kWh**. Module switching is the best route in ~7% of simulated lots; cell switching in 0.1%.
- **"The inverter decides":** value depends mainly on **DC-voltage headroom**. An 8-module column can bypass nothing below ~20% charge. Adding a 9th module per column restores the value (~$7–8/kWh median), under assumed inverter windows.
- It honestly separates "real data" (36 cells, capacity only) from assumed values.

**Lessons for PeakSure:**
1. N_min and the DC window (§P1) are likely the **first-order driver** of V1. Run N_series and spare cells as a primary sensitivity, not a footnote.
2. Expect that **V1 alone may be small**. This strengthens the case for measuring V2/V3 (information value) separately, because that is where a non-zero result may come from.
3. Adopt the same honesty format (real vs model vs assumed on every slide).

# AC. Thermal Angle: "Hot Afternoon / Hot Cell" (teammate proposal, assessed with real data)

## AC1. The claim
> "Every summer, a Massachusetts town's electricity costs for the whole year are set in one hot afternoon. That's exactly when conventional batteries overheat and throttle down, because one hot cell limits the whole system. REON's cell-level control lets the hot cell rest while every other cell keeps delivering."

## AC2. What the ISO-NE SMD data shows (computed by us; `tools/peak_temps.py`, `data/isone/peak_temps.csv`)
Source: ISO-NE SMD hourly files for 2019–2026, from the team Drive. Columns `Dry_Bulb` and `Dew_Point` were confirmed. The load column is `System_Load` (system) or `RT_Demand` (zone). The peak is taken as the max-load hour, a close proxy for the official settlement peak.

| | ISO-NE system | WCMA zone (Sterling/Holden region) |
|---|---|---|
| **Annual peak, 2019–2026** | **All 8 in Jun–Sep**, hour ending 16–19 (mostly 18). Dry bulb **88–97 °F (31–36 °C)**, mean 92.4 °F | All in Jun–Sep, hour ending 18–19. Dry bulb **84–94 °F (29–34 °C)**, mean 89.5 °F |
| **Monthly peaks** (93) | mean 55 °F | **Summer (Jun–Sep): mean 84.7 °F, range 72–94 °F. Winter (Dec–Feb): mean 16 °F, range −1 to 30 °F (−18 to −1 °C).** Only 23 of 93 monthly peaks were ≥ 85 °F |
| Typical peak hour | HE 18–19 | HE 18–19 (HE 12 in April) |

Annual peaks by year (WCMA dry bulb): 2019 84 °F · 2020 90 · 2021 92 · 2022 88 · 2023 89 · 2024 87 · **2025 94 (Jun 24)** · 2026 92 °F.

## AC3. Assessment
- **"One hot afternoon" is true for the annual capacity peak** (8/8 years, summer evening, ~90 °F). It is not the whole bill. At current rates the 12 monthly RNS peaks are worth ~4× the capacity peak (§Q3), and **a quarter of those peaks are in deep winter (−18 to −1 °C)**.
- **Better framing: "both temperature extremes."** The battery must deliver on the hottest summer evening **and** the coldest winter evening. For Na-ion the cold side matters for **charging** too (see AC4): pre-charging before a winter peak may be limited.
- **"Conventional batteries overheat and throttle"** is a **hypothesis**, not established for HVAC-cooled containers. Ambient 35 °C ≠ cell temperature. Throttling happens if the *hottest cell* exceeds its limit; this depends on HVAC capacity and the **cell-to-cell temperature spread inside the container**. We found no public data for the CES. **Ask REON.**
- **"REON lets the hot cell rest"** is consistent with the brief: temperature is monitored per cell, and bypass is allowed "when thermal and safety requirements allow". This is a **plausible new physical-value channel (V1-thermal)**: in a fixed string, the hottest cell forces a current derate for the whole string; with bypass, only that cell rests.

## AC4. Temperature limits (base assumptions)
| Source | Charge | Discharge | Status |
|---|---|---|---|
| Eastups layered-oxide Na-ion cell datasheet | **0 to 40 °C** | **−40 to 60 °C** | Vendor datasheet (not REON) |
| CATL Naxtra (EV) | −40 to 70 °C (reported shared range) | | Press |
| REON EBS Na+ (marketing) | −40 to 140 °F (−40 to 60 °C) operating | | Company claim |
| TUM ageing study | Calendar ageing tested at 25 and 45 °C; a clear SOC effect only at 45 °C | | Peer-reviewed |
| Leeds (Appl. Energy 2026) | Na-ion keeps 51–62% of its 25 °C capacity at −40 °C | | Peer-reviewed |

**Base assumption:** Na-ion charge 0–40 °C, discharge −40–60 °C, current derating starting at ~45 °C. All are labelled ASSUMED until REON shares its limits.

## AC5. How to add it to the model (P1, only after P0 works)
- Cell temperature = ambient (from SMD Dry_Bulb at each peak hour; zone WCMA) + HVAC offset + I²R self-heating + **per-cell offset ~ N(0, σ_T)**, with σ_T a few °C (ASSUMED; sensitivity 1–8 °C).
- Derate rule: if a cell exceeds T_derate, the fixed string derates its current; REON bypasses that cell instead (subject to N_min).
- Cold rule: if a cell is below its charge limit, the pre-peak charge is limited unless it is heated (HVAC energy cost).
- Report: missed-peak rate and $ by **season**, and V1-thermal separately from V1-capacity.

# AD. Real MLPs: Customers, Peak Load, Batteries

| MLP | Customers | Peak load | Battery | Public savings figure | Source |
|---|---|---|---|---|---|
| **Sterling** | 4,013 (MMWEC page, year not stated; the town site says >3,700; DPU 2024: 4,378 meters) | **13.6 MW** (MMWEC, year not stated) | 2 MW / 3.9 MWh (since 2016) | $240,660 annual-peak saving (2016 data) | MMWEC; Sandia/ESTAP |
| **Holden** | 8,653 (MMWEC page; HMLD press says ">7,600") | **26.4 MW** (MMWEC) | **5 MW / 22 MWh** (Lightshift/MMWEC, 2024; owned by Delorean) | **>$10 M over 20 yrs** (HMLD GM, "conservative") | MMWEC; APPA; BusinessWire |
| Reading | >30,000 meters | Not found | 5 MW / 10 MWh (NextEra, 2019) + more planned | $346K net in the first 19 months | RMLD; MMWEC |

**Per-household framing (simple arithmetic, upper bound; not a model result):**
- **Holden:** 5 MW × ($183.71 + $42.96)/kW-yr ≈ **$1.13 M/yr upper bound**, or **~$131 per customer per year**.
  - Holden's own projection (> $10 M / 20 yr ≈ $0.5 M/yr) equals **~$58 per customer per year, about 44% of our upper bound**.
  - This is a useful **calibration anchor**: realized savings are well below the bound (shared-savings contracts, partial peaks, conservative estimates).
- **Sterling:** 2 MW gives ≈ **$453K/yr upper bound ≈ $113 per customer per year** at 2026/27 rates.
- **Battery size vs peak:** Sterling 2 / 13.6 MW ≈ 15%; Holden 5 / 26.4 MW ≈ 19%. The town's demand charges are only partly shaved, so every kW delivered at the peak counts.

**Pitch use:** "what each household's battery is worth", using the model output for the chosen town, with Holden's own projection shown as a reality check.

# AE. Implemented Simulator (7 Nov 2026): Design Decisions and Corrections Found While Building

Code: `peaksure/` (physics, twin, decision, sim, econ, experiments), demo `app/`, tests `tests/`. The numbers are in **RESULTS.md**, which `tools/report.py` generates from `results/`; none are typed by hand.

**Physics.** Each condition simulates 8 strings × 240 switchable cell units. Fixed string: usable Ah = the minimum over the string's cells, and the hottest cell derates the whole string. Bypass: cells leave the path as they empty, while at least N_min stay active. Faulted or hot cells are excluded. Ageing:
- calendar: Arrhenius × SOC stress, with SOC sensitivity rising with temperature (TUM);
- cycle: DoD-weighted, with per-cell lognormal rate multipliers correlated with initial resistance.

The tests reproduce the brief's 16-cell example: 70 Ah fixed, 84.06% average, and the N_min-bounded bypass.

**Information.**
- *Pack estimator:* an annual 25 °C capacity test plus nominal fade extrapolation.
- *Cell twin:* a per-cell Kalman filter (level + trend) on noisy per-cell capacity reports.
- Both beliefs include the **day-ahead temperature forecast error**.
- Ground truth and belief are separate objects throughout.

**Decision.** Choose window start, length and power to maximize expected shaved kW, subject to **P(D ≥ P·W) ≥ 95%**. The peak-hour forecast is empirical, leave-one-year-out by season.

**Corrections made during the build (all affect results; recorded for transparency):**
1. **The baseline rule was too weak at first.** The first version committed P5/3 over a fixed 3-h window, which overstated optimizer gains. It was replaced by the conventional practice: full available power for floor(P5 energy / power) hours, centred on the modal hour.
2. **The twin was overconfident at first.** It ignored temperature-forecast error: P5 miss was 12% vs the 5% target. Forecast uncertainty is now sampled inside the belief.
3. **The optimizer was unconstrained at first** (risk-neutral expected value). The 95% deliverability chance constraint now matches the PeakSure promise.
4. **The forecast smoothing was too heavy.** Add-α was 0.5; it was chosen by out-of-sample log-likelihood and set to 0.1. The modal hour captures the actual peak **65.5%** of the time. Peak timing, not energy, is the dominant uncertainty for a 2-h system.
5. **Premium definition.** The premium is reported as the **same-rule** comparison (C vs A_opt, B vs A), so the decision-rule effect is never credited to REON hardware.

# AF. The Open REON Questions, Answered as Far as Public Sources Allow (7 Nov 2026)

Sources checked:
- REON's challenge video (Tim Ren, CTO), with slides read frame by frame and the speech transcribed locally;
- the official brief;
- REON_WHO_WE_ARE.pdf and reoncorp.com;
- REON patent US 2023/0341471 (full text);
- vendor PCS datasheets;
- the TUM sodium-ion paper.

| Question | What public sources say | Status / what we use |
|---|---|---|
| **CES chemistry** | REON is "chemistry agnostic" (site). The EBS product ships in Na+ and Li+ versions. The patent lists Li-ion, LiFePO4, **sodium-ion**, solid-state and others. **No source names the CES chemistry.** | Open. Na-ion is the base case and LFP the sensitivity (both run) |
| **Cells per string** | Patent: cells in series form a **column**, columns run in parallel; "a quantity of series cells chosen to reach a target voltage". No number given. CES AC side is **480 V 3φ** (confirmed). 480 Vac PCS units need **≥ ~750 Vdc** (Delta PCS125: 750–1,000 Vdc; MW class: 695–865 Vdc minimum). With a 1,000 V maximum and 3.8 V cell maximum, **N_series ≤ ~263** | **Derived:** about 240–300 cells per string |
| **N_min** | Set by the DC floor. At 750 V: **242 cells at 3.1 V**, 268 at 2.8 V, 300 at 2.5 V. Na-ion's sloped voltage curve (1.5–3.8 V, TUM) makes the window tight. **Implication:** with a sloped chemistry, deep discharge needs either a wide-range PCS or REON switching extra cells in as the voltage sags (the patent's "N+1 / 2N redundancy"). | **Derived:** our headroom of 2–20% (N_min = 192–235 of 240) brackets this. Base 10% is optimistic at low SOC, and the **Lot Desk deck reached the same "inverter decides" conclusion** |
| **Switch losses** | Patent: "isolated-gate transistor" switches; no ratings. **Ohm's law:** each cell's in-path switch carries the full string current, so loss fraction = I·R_on / V_cell. For 2.5 MW over 240 cells at 3.1 V: **8 strings ≈ 420 A**, 16 strings ≈ 210 A, 24 strings ≈ 140 A. Loss at 0.25 / 0.5 / 1.0 mΩ: **3.4% / 6.8% / 13.5%** (8 strings), 1.7% / 3.4% / 6.8% (16 strings), 1.1% / 2.3% / 4.5% (24 strings). | **Derived and important:** our base 1% needs about **80 µΩ per cell path at 8 strings**, i.e. several paralleled MOSFETs per cell, or more parallel columns. The 2% sensitivity already pushes the 2-h premium to about 0. **The single most decision-relevant number to get from REON** |
| **Cell temperature spread** | Vendor practice: liquid-cooled containers about **2–3 °C** cell-to-cell, air-cooled about **5–10 °C** (vendor blogs, not a standard). The patent mentions per-cell temperature and "rapid increase" triggers, with no numbers. | Literature range. Our base σ_T = 2.5 °C means a max-min range of about 15 °C across 1,920 cells, which is air-cooled-like. A liquid-cooled CES would make the thermal channel **smaller** than our base case. The weak/failing HVAC scenarios remain stress tests |
| **Can a cell be probed?** | Brief: teams may assume per-cell **voltage, temperature, SOC, SOH, capacity, resistance, OCV and history**, and can **include or remove any cell**. Patent: per-cell **voltage, current, temperature and impedance sensors**, plus per-cell couple/decouple switches. Video: "a switch at every cell … Sense, Protect, Balance, Decide, Isolate, Mix". | **Supported:** switching a cell in or out is a current step, and the per-cell impedance sensing exists. A dedicated test current is not described, and probe accuracy remains assumed (0.5%) |
| How REON allocates current | Video (Tim Ren): cells charge and discharge "according to their state of health, from minimum to total sum" | Consistent with our bypass model (each cell runs to its own end; usable = sum, bounded by N_min) |

**Net effect on our conclusions:** none reverses them.
- The derived DC-window and switch-loss physics make the 2-h base case slightly **less** favourable than modelled.
- The derived thermal spread makes the "hot cell" channel smaller with liquid cooling.
- The four Discord questions shrink to two numbers that matter most: **switch R_on per cell path (with the number of parallel columns)**, and the **CES DC window / cells per column**.

# AG. Mixed-Age, Lifetime-Control, and Twin-Mismatch Extensions

The reproducible exploratory study is in `peaksure/experiments.py --only research`, with paired event and monthly records in `results/events_research.parquet` and `results/monthly_research.parquet`. `tools/report.py` generates the quantitative comparisons in `RESULTS.md` §T6 and `web/public/data/results.json`. The established A–D benchmark remains unchanged; exact-seed C and C_T3 outputs were checked against the saved baseline.

**Mixed-age cohort.** Cells have the same chemistry and are assigned different assumed prior calendar ages. Their initial capacity follows the existing calendar-fade law, and the per-cell age clock continues from that age. The cohort is synthetic: prior cycling, provenance, screening, and second-life safety history are unavailable. The comparison pairs conditions on the same population and peak draws. A C versus A_opt contrast combines hardware and information effects, so it must not be attributed solely to REON hardware.

**Lifetime control.** The existing weak-capacity resting-SOC policy is compared with a new policy that assigns the limited number of lower-SOC standby slots to cells with the fastest fade trend in the twin posterior. Both use the same assumed lower-SOC target and the same peak recharge assumption. The new policy uses estimated trends, never true capacities. End-of-horizon deliverable energy, augmentation, savings, NPV, and calibration are reported together, including null or negative results. This is an optimal allocation only within the simple fixed-slot, separable calendar-stress model; it is not an optimal battery lifetime controller. Per-cell independent standby SOC and sufficient recharge before a peak remain unconfirmed REON capabilities.

**Twin mismatch.** The robust policy takes the sample-wise lower value of two predictive energy distributions: the per-cell twin and the annually tested pack estimator. A smoothed, one-sided disagreement with the pack test is recorded as a diagnostic alert. The conservative envelope applies throughout, including before an alert. It uses noisy observations and model beliefs, not simulator truth. Sample-wise minimization can double-count shared uncertainty, so only the measured simulated coverage is claimed. The study compares it with the unguarded twin under both no injected bias and systematic trend/measurement bias, reporting calibration and the economic trade-off. A low miss rate in these simulated cases is not a field reliability guarantee; common-mode errors in both estimators remain untested.

**Remaining validation:** obtain REON cell paths and switch losses, the DC voltage window, independent pack and cell measurements across age cohorts, measured ageing under different standby SOC and temperature, and evidence that per-cell standby SOC and recharge are operationally possible. These are required before claiming lifetime or efficiency improvement on hardware.

**Validation protocol before deployment on hardware:** split independent packs and calendar periods into development and held-out sets; fit ageing and measurement-noise parameters only on development data; lock the rest policy and guard threshold before evaluation. On held-out packs, report calibration by age cohort and temperature, false-alert frequency, peak miss rate, delivered AC energy, cell-level degradation, augmentation, and net value with pack-clustered uncertainty intervals. Measure recharge energy and round-trip efficiency separately: the current simulator has no charge-side energy balance, so it cannot establish an efficiency improvement. Inject common-mode sensor drift and pack-test bias, not only the current twin-only bias, before any reliability claim.

# AH. Ageing Fitted to TUM Data, Switching Transient, and R_on Break-even (7 Nov 2026)

**AH1. Na-ion ageing fitted to the TUM tables** (`peaksure/fit_tum.py`, data `data/processed/tum_naion_tables.csv`, output `results/tum_fit.json`).
- Data: Bahrke et al. 2026, Table 5 (calendar, 630 d, 25/45 °C × SOC) and Tables 2/4 (cycling at 25 °C, 1C, by SOC window). Only end-of-test table values are used. The raw check-up trajectories (doi:10.14459/2026mp1840745) need a browser download and are **not** fitted yet.
- Calendar fit (same model form as the simulator, least squares on 6 points): **cal_a = 0.014 /√yr, Ea = 28.4 kJ/mol, β_SOC(25 °C) = 2.0, β_SOC(45 °C) = 1.79, low-SOC penalty = 0**. Leave-one-out ranges: cal_a 0.011–0.016, Ea 24–37 kJ/mol, β25 1.7–3.0 (upper bound hit, so β25 is poorly identified).
- Excluded: 25 °C / 50% and 70% SOC (6.9% and 14.3% loss). The authors attribute these to plating and high initial R_DC, and exclude the 50% cell from their own temperature comparison. Our monotone SOC law cannot reproduce them.
- At the operating point (25 °C, 90% standby SOC) the fit reproduces the measured 3.3% loss in 630 d. The old assumed set gave about 25% faster fade there and about 2× faster at 45 °C.
- Cycle fade: after subtracting the fitted calendar loss, TP8/TP9 (60–80% and 80–100% windows, about 4,300 EFC) give **cyc_b ≈ 2.1×10⁻⁵ per EFC** (old assumption 1×10⁻⁴). Full 0–100% windows (TP1–3) fade more than 10× faster (2.5–4.2×10⁻⁴). They are outside the CES duty, which keeps DC headroom and discharges from the top.
- Peak duty is about 22 EFC/yr, so calendar ageing dominates and the cycle change is second-order.
- Caveats: 3–4 cells per test point; only two temperatures (the authors say this is not enough for kinetics); cylindrical lab cells, not REON's CES cells. Flags changed from ASSUMED to DERIVED.
- Consequence to watch: β_SOC is now large, so lower standby SOC slows calendar fade strongly in the model. The §AG/§T6 resting-SOC results inherit this and rest on 3-cell points.
- **Effect on results (regenerated, RESULTS.md):** savings are almost unchanged. V1 (bypass) rises from about $5.9k to $9.9k/yr. V2 (cell twin) falls from −$4.1k to −$10.4k/yr. **The cell twin's P5 miss rate rises from 4.4% to 9.8% (target 5%).** The twin's prior trend and process noise are scaled to the nominal fade (`sim.py`, `prior_trend`). With slower and more SOC-dependent fitted fade, the per-cell spread (aging_sigma 0.40) dominates and the twin is over-confident (interval width 0.7%). Retuning the twin's process noise is an open fix. We did not tune it to make the number look better.

**AH2. Bypass transient** (`peaksure/switching.py`, `results/switching.json`, tests `tests/test_switching.py`).
- Setup: one cell commutates out of a 240-cell string at full power into a DC link with an ideal constant-power inverter (worst case: negative incremental resistance).
- Commutation times are LIT (Hanzl et al., IET Power Electron. 2021: 0.21 µs out, 0.9 µs in). Loop L (1–20 µH), DC-link C (1–10 mF) and unit resistance are ASSUMED and swept.
- Result: the DC voltage steps by 1/240 (0.44%). Undershoot is ≤ 0.19% and current overshoot ≤ 1.5%. It settles to within 0.1% in **0.12–1.3 ms** across the sweep.
- Switching energy: 276 µJ at 125 A (measured, Hanzl 2021), scaled linearly to 440 A, gives about 1 mJ per event. A full discharge has at most 192 events, about 0.19 J, which is **≈1×10⁻¹¹ of rated energy**.
- Conclusion: the minute-step, instantaneous-bypass assumption is valid for energy and economics. EMI, protection and gate-drive design are out of scope (the brief: "you do not need to design the switch hardware").

**AH3. R_on and DC window: what we model and what we ask REON.** The conduction-loss map (I·R_on/V_cell; §AF) is now code (`switch_loss_from_ron`). `breakeven_switch_loss` gives, year by year, the switch loss at which bypass delivers no more than a fixed string on the same cells. Questions to send: `REON_QUESTIONS.md`.

# AI. Product Update, Chemistry Comparison and Price Ranges (7 Nov 2026)

## AI1. Which REON product has cell-level control (from REON)
- **CESS (container, 2.5 MW / 5 MWh) and OES (cabinets) are white-label products from other vendors.** REON's website still describes the CESS as using "REON's cell-level intelligence"; REON's direct statement takes precedence.
- **EBS (Energy Block System) is the product with REON's cell-level control BMS.** Public specs: Na+ version 30 kW / 60 kWh, 20,000-cycle claim, −40 to +140 °F; Li+ version holds "more than twice the energy in the same form factor" (no kWh given).
- **What this means for the model:**
  - Condition A = a conventional-BMS battery (for example the white-label CESS). B, C and D = the same 2.5 MW / 5 MWh built from about 84 EBS blocks (2,500 / 30 = 5,000 / 60 = 83.3).
  - The power-to-energy ratio is still 2 h, so existing results carry over as a first approximation.
  - The string design changes: a 60 kWh block holds roughly 120 cells at 3.1 V / 160 Ah, so strings are shorter than our 240-cell assumption. Bypassing one cell then costs a larger share of string voltage, and the DC window matters more.
- **New questions for REON:** EBS cells per block and block DC voltage; whether each block has its own DC/DC or inverter stage; how blocks are paralleled; EBS Li+ energy per block; EBS price or price premium.

## AI2. Lithium-ion (LFP) next to sodium-ion
- The simulator already supports both chemistries. Na-ion is the main study (64 runs); LFP is the chemistry sensitivity (24 runs, conditions A–C).
- `peaksure/curves.py` adds representative voltage curves: Na-ion slopes over 1.5–3.8 V (energy average about 3.13 V); LFP sits on a 3.25–3.34 V plateau (about 3.28 V).
- **Finding (illustrative, not yet in the simulator):** with a 480 V AC inverter (about 750 V DC minimum) and a 240-cell string, the sloped Na-ion curve reaches the DC floor at roughly half charge, and earlier still once cells are bypassed; LFP stays above it until nearly empty. The exact SOCs are computed live by `curves.min_soc_above_floor` in the Streamlit *Chemistry & cost* tab. Unless the EBS has a wide-range DC/DC stage or many more cells in series, the DC window could cap Na-ion usable energy. The simulator tracks Ah only and does not yet apply this limit.

## AI3. Installed-cost ranges (REON gave no price signal)
All prices are installed $/kWh for a conventional 2-h, few-MWh US municipal project. Code: `peaksure/costs.py`.

| Chemistry | Low | Central | High | Basis |
|---|---|---|---|---|
| LFP | 219 | 373.75 | 846 | Central: team sheet (S1), Modo Energy Sep 2026 global 2-h median $325/kWh × 1.15 US premium. Low: BNEF 2025 US turnkey (narrower scope). High: Concord 2024 all-in |
| Na-ion | 250.75 | 427.94 | 968.67 | LFP × 1.145, the team sheet's sodium premium (A2; illustrative, not verified) |
| Full-system premium over conventional | −5% | +10% | +20% | Team sheet A1 (+10%, no REON quote). Relectrify claims cell-level electronics cost less than a standard BMS; Chalmers reports higher upfront cost |
| BMS-only retrofit | $25/kWh | $50/kWh | $75/kWh | Central: team sheet A8, $250k for 5 MWh. Low/high ±50% (our assumption). Third-party compatibility unverified |
| O&M | $60k/yr conventional | $65k/yr REON | +$7k/yr retrofit | Team sheet A5, A10 (illustrative), per 5 MWh |
| Discount rate, life | 8% | 15 yr | 10 yr after retrofit | Team sheet A6, A7, A11. Product economics use 8%; science tables keep 7.5% |

Public benchmarks used (scope differs; never compare without it):
- BNEF 2025 (via Energy-Storage.news): stationary pack $70/kWh; turnkey system $117 global, $73 China, $177 Europe, $219 US; global 2-h $124, 4-h $110.
- China tender (CNESA, Sep 2026, 100 MW / 400 MWh): Na-ion system bids about $153/kWh vs LFP about $79/kWh.
- Cells (Wood Mackenzie 2025): LFP about $52/kWh, Na-ion about $59/kWh. CATL's ~$19/kWh Na-ion figure is a claim or forecast.
- US C&I installed, larger containers: about $180–320/kWh (vendor and industry guides, indicative).
- Massachusetts projects (REON ROI sheet): Concord 2024 $657/kWh equipment and $846/kWh all-in; Sterling 2016 $692/kWh.

**Results** (cost does not change the simulation, so no rerun is needed): `costs.breakeven_capex` gives, per run, the installed $/kWh at which 15-year NPV (savings − augmentation − O&M − capex) is zero, and `costs.npv_at_price` gives NPV at any price and EBS premium. Both are computed live from `results/` in the Streamlit *Chemistry & cost* tab; numbers are not copied here (AGENTS.md rule 1). At 2 h, the break-even price for conventional and EBS + PeakSure is close, so the installed price per kWh, not the chemistry or cell-level control, decides the business case.

## AI4. Strategy: two phases (retrofit first, then new batteries)
Both phases shave the town's ISO-NE coincident peak, so the same simulation applies (`peaksure/costs.py`, Streamlit *Chemistry & cost* tab):
1. **Phase 1, BMS-only retrofit:** REON's cell-level control added to batteries towns already own. No battery cost, so it is the cheapest way to show the technology works on real peaks. The customer pays the retrofit price and gains the difference in value between the retrofitted and unchanged battery over its remaining life. Output: `costs.retrofit_breakeven`, the most the retrofit can cost per kWh of battery, by battery age at retrofit and scenario.
   - Candidates (`costs.TOWN_BATTERIES`, `costs.town_retrofit_table`): Sterling 2 MW / 3.9 MWh (2016), Reading 5 MW / 10 MWh (2019), Holden 5 MW / 22 MWh (2024). Each uses the closest simulated case at its current age, scaled per kWh; none is simulated individually.
   - Approximation: the retrofitted battery follows the bypass path from year 0, so its cells age under bypass and its twin has the full history before the retrofit. Older retrofits are therefore slightly optimistic.
   - Same decision rule on both sides (B vs A for hardware only; C vs A_opt for hardware + twin).
   - Open: REON has not confirmed that its cell control can be retrofitted to other vendors' batteries (compatibility, warranty, safety, certification).
2. **Phase 2, new batteries:** once Phase 1 gives field evidence, sell new batteries built with REON's cell control (EBS blocks; about 84 for a 2.5 MW / 5 MWh plant). Compared with a new conventional battery; the customer pays the battery price plus any premium. Output: NPV vs installed price and the break-even price.
   - Open: REON has not confirmed MW-scale EBS fleets, block interconnection, or per-block DC/DC.

## AI5. Team financial model vs simulation
The team's one-sheet model (`PeakSure_REON_One_Sheet_Financial_Model_With_Sources.xlsx`) is reproduced exactly by `costs.team_sheet()` (tested). It **assumes** REON's extra savings: +10% for the full system and +$55k/yr for the retrofit. The simulator **computes** them from cell physics on ISO-NE peaks. The app shows both with identical prices, O&M, life and discount rate, so only the savings differ. Notes on the sheet:
- It still calls the full-system product "REON CESS"; per §AI1 the CESS is white-label and the cell-level product is the EBS.
- Its 14.5% sodium premium (A2) is listed but not used in its own scenarios; the model applies it to Na-ion.
- The module-replacement comparator (A12–A14) exists only in the sheet; the simulator does not model partial module replacement.
- At 2 h, the simulated REON savings are far below the sheet's assumptions; they approach or exceed them only in the 1-h, 4-h, cooling and fault scenarios. Numbers are computed live in the app (AGENTS.md rule 1).

## AI6. Massachusetts case, licensing and compliance (team workbook)
Source: `PeakSure_REON_Paxton_With_MA_Compliance.xlsx`. Code: `costs.PAXTON_INPUTS`, `paxton_sheet`, `LICENSING_INPUTS`, `licensing_sheet`, `licensee_value`, `COMPLIANCE_ITEMS`; Streamlit tab *MA case & licensing*. `paxton_sheet()` and `licensing_sheet()` reproduce the workbook exactly (tested).
- **Phase 2, Paxton-sized plant:** 3 MW for 3 h built from EBS units (30 kW / 60 kWh, 90% usable) needs 167 units, energy-limited (10.02 MWh nominal, 5.01 MW installed), priced at the US-adjusted Modo benchmark plus $250k additional costs, 20 years at 8%. The sheet assumes $500k/yr gross savings from Paxton's reported $10M over 20 years. The app also runs the sheet's formula with simulated savings from the 3-h study, scaled per kW to 3 MW and averaged over its 15 simulated years.
- **Phase 1, licensing:** REON sells its technology per MW (hypothetical $100k/MW upfront, $12k/MW-yr, 5 MW portfolio, 10 years; REON's own implementation and recurring costs). The app adds the battery owner's side: simulated extra savings over the licence term against the fees (annual fee treated like O&M), by battery duration and condition.
- **Compliance:** 13 Massachusetts requirements (siting 225 CMR 29.00, fire 527 CMR 1.00 / NFPA 855, UL 9540/9540A, electrical 527 CMR 12.00, interconnection, ISO-NE registration, environmental, 310 CMR 30.000 decommissioning, Clean Peak, cybersecurity, third-party retrofit feasibility). Every cost is an unpriced placeholder ($0 = unknown); the app lets users enter estimates, which flow into the plant capex and annual net and into REON's licensing NPV.
- Limits: the 3-h simulation is 2.5 MW / 7.5 MWh Na-ion with 240-cell strings, not distributed 60 kWh EBS units; 167 distributed units may need site-by-site permits, extra balance of plant and validated controls; a retrofit licence may invalidate a third-party battery's UL 9540 listing.

---

# Z. Change Log (Part II)

| # | Change | Type | Reason |
|---|---|---|---|
| 1 | Added the primary research question (J1) and the three-value framework (J2) | Addition | Task brief |
| 2 | Established-vs-hypothesis table (J3); novelty narrowed to the decomposition + decision-focused probing (J4) | Addition / narrowing | Combination ≠ novelty |
| 3 | Technical architecture with component types (K) | Addition | — |
| 4 | Pre-registered hypotheses H1–H6, including a negative control (L) | Addition | — |
| 5 | Baselines A/B/C/D + a factorial design with Shapley attribution to avoid double counting; decision-rule value separated (M) | Addition | Part I §B mixed the rule and information effects |
| 6 | Calibration protocol with Wilson CIs, CRPS, conformal option, out-of-sample plan (N) | Extension of §A | — |
| 7 | VoI protocol: added the random policy, noise and bias robustness, uniform-uncertainty control, "simulated capability" label (O) | Extension of §I | — |
| 8 | Engineering constraints + safe fallback logic; confirmed vs assumed (P) | Addition | — |
| 9 | **Correction:** Sterling's 2016 per-peak values are not representative of 2027 capacity prices | Correction | Simple arithmetic vs FCA 18 |
| 10 | **Correction:** monthly RNS peaks ≈ 4× annual capacity value, so the headline becomes "13 peaks", not "one hour" | Correction | Q3 arithmetic |
| 11 | **Correction:** dispatch is more frequent than 13 events/yr, because operators dispatch on several candidate days | Correction (assumption flagged) | Timing uncertainty |
| 12 | **Correction to §C:** for Na-ion, lower resting SoC is not established at 25 °C, and very low SoC raises anode loss. Target a moderate SoC | Correction | Read Bahrke et al. 2026 directly |
| 13 | Added Na-ion variability facts from the PDF (R_DC CoV 10–12%, ageing spread 3.1–23.4%, R_DC ↔ plating r = −0.675) | Addition (PR) | Strengthens the uncertainty and probing rationale |
| 14 | Evidence audit (U), with units checks | Addition | — |
| 15 | Demo script + fallback (S); placeholder figures/tables (T); risks (V); REON questions (W); roadmap P0/P1/P2 (X); pitch (Y) | Addition | — |
| 16 | **No LLM component added.** No identified problem is solved better by an LLM than by inference/optimization; it would add unverifiability | Decision | Task brief §2 |
| 17 | Nothing from Part I deleted; Part I statements superseded by corrections 9–12 and 18–23 are left in place and annotated here | Policy | Traceability |
| 18 | **Brief (AA):** probing is within REON's stated hackathon capabilities (switch any cell in or out), so the label changes from "simulated capability" to "stated capability, physical accuracy unconfirmed". §O5 and §P3 should be read with this update | Correction | Official brief |
| 19 | **Brief (AA):** the Nature Energy 19–27% figure is EV-only and must not be presented as a REON or stationary-storage result | Correction | Official brief |
| 20 | **CES naming and voltage:** "CES" is correct (REON PDF), and 480 V is the 3φ **AC** interface, not the DC string voltage. This corrects §H5's "480 V is our inference" | Correction | REON_WHO_WE_ARE.pdf |
| 21 | Added the Lot Desk deck lessons: DC headroom / N_min is a likely first-order driver of V1; V1 may be small (AB) | Addition | Team Drive |
| 22 | Thermal angle assessed with **real ISO-NE data**: annual peaks are summer HE 18–19 at 84–97 °F; winter monthly peaks fall to −18 °C. Reframed as "both temperature extremes"; container throttling is a hypothesis (AC) | Addition / correction | `peak_temps.csv` |
| 23 | Real MLP numbers (Sterling, Holden, Reading) and a per-household upper bound; Holden's projection ≈ 44% of the bound is a calibration anchor (AD) | Addition | MMWEC, HMLD |
| 24 | New tool `tools/peak_temps.py`, tested on synthetic data, then run on the 2019–2026 SMD files | Addition | Reproducibility |
| 25 | Simulator, demo and automated results report implemented; five build-time corrections listed in §AE | Addition / correction | Implementation |
| 27 | REON's open questions answered from public sources and engineering derivation (§AF). Switch loss = I·R_on/V_cell is first-order: the base 1% needs ~80 µΩ per cell path at 8 strings. The DC window (480 Vac → ≥ ~750 Vdc) bounds N_min | Addition | REON video, patent, PCS datasheets |
| 26 | A teammate's Colab notebook independently reproduced the annual-peak dates and hours (it uses hour-beginning, we use hour-ending) | Verification | Cross-check |
| 28 | Added paired synthetic mixed-age, twin-trend resting-SOC, and independent pack-test safety-envelope studies (§AG; generated results §T6). The baseline was verified unchanged. | Addition / limitation | Explicit scientific focus, with assumptions and negative outcomes retained |
| 29 | **Ageing fitted to TUM Tables 4–5** (§AH1): cal_a 0.030→0.014, Ea 35→28.4, β25 0.10→2.0, β45 0.90→1.79, low-SOC penalty 0.30→0, cyc_b 1e-4→2.1e-5. Full study, RESULTS.md and web data regenerated | Correction (ASSUMED→DERIVED) | Fit to published data |
| 30 | Bypass transient and R_on break-even checks added (§AH2–AH3); minute-step assumption confirmed for energy | Addition / verification | Model validity |
| 31 | REON: CESS and OES are white-label; the EBS carries the cell-level BMS. A = conventional BMS, B/C/D = ~84 EBS blocks (§AI1) | Correction (framing) | Statement from REON |
| 32 | Na-ion vs LFP voltage curves and DC-floor check (`peaksure/curves.py`, §AI2) | Addition | Chemistry comparison |
| 33 | Installed-cost ranges per chemistry, EBS premium range, O&M, capex-aware NPV and break-even price (`peaksure/costs.py`, §AI3); Na-ion range provisional | Addition (ASSUMED) | No REON price signal |
| 34 | Prices, premiums, O&M, discount rate and retrofit inputs taken from the team financial model; Na-ion = LFP × 1.145 (§AI3) | Update (ASSUMED) | Team sheet |
| 35 | Two products: full system and BMS-only retrofit, with break-even retrofit price by battery age; team sheet reproduced and compared with simulated savings (§AI4–AI5) | Addition | Product scope |
| 36 | Two-phase strategy: Phase 1 retrofit (prove the technology), Phase 2 new batteries (scale); Massachusetts retrofit candidates Sterling, Reading, Holden (§AI4) | Framing / addition | Team decision |
| 37 | Paxton-sized EBS plant, per-MW licensing (REON and owner sides) and Massachusetts compliance allowances from the team workbook (§AI6) | Addition (ASSUMED) | Team workbook |

---

# Sources

- Second-life field data, cell-level SoH vs lumped models: arXiv 2609.04487. https://arxiv.org/pdf/2609.04487
- Chalmers reconfigurable pack study coverage: https://electrive.com/2026/10/09/cell-bypass-aims-to-extend-the-usable-life-of-ev-batteries ; https://eurekalert.org/news-releases/1146902
- Degradation-conscious reconfigurable control: https://mdpi.com/2313-0105/9/4/217
- Robust SoH under model mismatch: arXiv 2504.13324. https://arxiv.org/pdf/2504.13324
- Grid storage controller robustness via deliberate mismatch: https://www.osti.gov/servlets/purl/1592238
- Probabilistic (Bayesian ensemble) battery prognostics: arXiv 2405.15292. https://arxiv.org/pdf/2405.15292
- Convex rainflow degradation cost: arXiv 1703.07968. https://arxiv.org/pdf/1703.07968
- Depreciation is a poor proxy for aging cost: arXiv 2403.10617. https://arxiv.org/pdf/2403.10617
- Cradle-to-gate LCA of Li-ion cells, J. Industrial Ecology 2025: https://ideas.repec.org/a/bla/inecol/v29y2025i1p113-128.html
- Carbon footprint vs cell chemistry: https://www.batterydesign.net/carbon-footprint-vs-cell-chemistry/
- LFP/graphite cycle aging (TUM): https://portal.fis.tum.de/en/publications/analysis-and-modeling-of-cycle-aging-of-a-commercial-lifepo4graph/
- REON technology: https://reoncorp.com/technology

**Novelty (§I):**

- Switching excitation improves estimation: https://mdpi.com/2313-0105/9/3/145
- Online SoH in reconfigurable batteries: https://www.vde-verlag.de/proceedings-en/565822261.html
- VoI active diagnosis: https://research.microsoft.com/%7Ehorvitz/Ashish_Kapoor-Eric_Horvitz-NIPS2009.pdf ; https://arxiv.org/pdf/1703.05452v2.pdf
- Not novel (fleet pooling): https://arxiv.org/pdf/1904.03505 ; https://ar5iv.labs.arxiv.org/html/2404.12818

**Added in the data sheet:**

- REON solutions: https://reoncorp.com/solutions ; job posting: https://www.career.com/job/reon-technology/senior-business-development-manager-c-i-energy-storage/j202605012135409181369 ; Caplight: https://www.caplight.com/company/reoncorp ; Na-ion container proxy: https://www.highstar-sodium.com/product/2300kwh-container-sodium-ion-bess/
- REON hardware: https://reoncorp.com/hardware ; REON home: https://reoncorp.com/ ; Greentown Labs: https://greentownlabs.com/?p=31278
- REON patent US 2023/0341471: https://patents.justia.com/patent/20230341471
- Reconfigurable BESS control (MERL-related): https://arxiv.org/abs/2301.05168

- Naumann et al. 2018, LFP calendar aging: https://portal.fis.tum.de/en/publications/analysis-and-modeling-of-calendar-aging-of-a-commercial-lifeposub/ ; data: https://data.mendeley.com/datasets/kxh42bfgtj/1 ; cycle data: https://data.mendeley.com/datasets/6hgyr25h8d
- Bahrke, Rehm, Natterer, Wendlandt, Jossen, "Calendar and cycle ageing of commercial sodium-ion cells with layered oxide cathodes", *EES Batteries* 2 (2026) 1157–1175, DOI 10.1039/d6eb00020g. Read directly from the PDF in `data/d6eb00020g.pdf`; the figures used are in §J3, §O1, and §R2.
- Leeds, Na-ion at low temperature (Applied Energy 2026): https://eprints.whiterose.ac.uk/id/eprint/239121
- Na-ion aging, EES Batteries 2026: https://pubs.rsc.org/en/content/articlelanding/2026/eb/d6eb00020g ; storage study: https://hal-univ-pau.archives-ouvertes.fr/hal-03607692
- Na-ion LCA: https://pubs.rsc.org/en/content/articlehtml/2025/ee/d5ee00415b ; https://www.ess-news.com/2026/09/28/sodium-ion-packs-25-less-carbon-intensive-than-lfp-say-researchers/
- Sterling: https://www.cesa.org/?p=8391 ; https://www.cleanegroup.org/wp-content/uploads/ESTAP-webinar-slides-3-7-2018.pdf ; https://communityresilience-center.org/wp-content/uploads/2017/03/Community-Energy-Planning-and-Financing-Resilient-Energy-Systems.pdf ; https://www.mmwec.org/wp-content/uploads/Sterling-Battery-Milestone-Release-4-19-final.pdf
- West Boylston: https://pv-magazine-usa.com/2025/05/05/construction-begins-on-9-mwh-battery-energy-storage-system-for-massachusetts-municipal-utility ; MMWEC storage: https://www.mmwec.org/how-we-are-green/energy-storage/
- Lightshift: https://www.businesswire.com/news/home/20260622969127/en/Lightshift-Energy-Deploys-Six-New-Battery-Storage-Projects-in-Massachusetts
- RNS rates: https://www.iso-ne.com/static-assets/documents/100025/a05.1_tc_ptoac_rns_rate_presentation.pdf ; https://www.iso-ne.com/static-assets/documents/100025/a05.2a_tc_rns_rate_forecast_presentation.pdf
- FCA 18: https://www.utilitydive.com/news/new-england-iso-ne-capacity-prices-rise/708322/
- ISO-NE 2024 Air Emissions Report: https://www.iso-ne.com/static-assets/documents/100028/final-2024-air-emission-report.pdf
- Clean Peak / ConnectedSolutions: https://nuwattenergy.com/en/massachusetts/clean-peak-battery-incentive-ma-2026 ; https://marketingdocuments.energytoolbase.com/marketing/Maximize-Energy-Storage-Revenue-in-the-Northeast-with-ConnectedSolutions-and-Clean-Peak-Standard-ppt.pdf
- BNEF prices: https://www.energy-storage.news/battery-storage-system-prices-continue-to-fall-sharply-bnef-and-ember-reports-find/ ; https://www.ess-news.com/?p=7552
- Second-life costs: https://ncst.ucdavis.edu/research-product/applying-levelized-cost-storage-methodology-utility-scale-second-life-lithium-ion ; https://pmc.ncbi.nlm.nih.gov/articles/PMC10339184
- Relectrify: https://medium.com/toyota-ventures/cell-level-control-to-enhance-battery-systems-our-investment-in-relectrify-10a95cdb1f26 ; https://www.latitudemedia.com/news/can-relectrify-sell-the-storage-market-on-its-inverterless-battery
- Dukosi: https://www.emobility-engineering.com/dukosi-dkcm-chip-on-cell-battery-monitoring-system/
- Chalmers: https://www.chalmers.se/en/current/news/e2-new-battery-architecture-could-extend-ev-battery-life-and-lower-ownership-costs/
- Nature Energy cell inconsistency 2026: https://scitechdaily.com/?p=535323 ; https://xenospectrum.com/en/ev-battery-pack-weakest-cell-energy-waste-nature-energy/
- Cell-to-cell variation: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5057166/ ; https://vbn.aau.dk/en/publications/results-of-screening-over-200-pristine-lithium-ion-cells
- Bypass losses: https://doaj.org/article/6a5f64d033384431985e9960181ecba6 ; https://opus4.kobv.de/opus4-hs-kempten/files/1744/ID1744_The_efficiency_and_profitability.pdf
- Retired EV volumes: https://mckinsey.com/~/media/McKinsey/Industries/Automotive%20and%20Assembly/Our%20Insights/Second%20life%20EV%20batteries%20The%20newest%20value%20pool%20in%20energy%20storage/Second-life-EV-batteries-The-newest-value-pool-in-energy-storage.pdf
