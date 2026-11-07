# REON CellLife AI
**Uncertainty-Aware Lifetime Optimization for Mixed-Age Battery Storage**

## Challenge Alignment
| REON challenge asks for | Where we answer it |
|---|---|
| Cell-level intelligence & control | Control Mechanism |
| Optimize performance, extend lifetime | Strategies B vs C vs A |
| Unlock new opportunities | Second-life cells without sorting/grading; BESS augmentation |
| Economic value | $ NPV, deferred replacement |
| Environmental value | Avoided embodied CO₂e, enabled reuse |
| Specific real-world application | 1 MWh commercial peak-shaving BESS, New England |

## Main Scientific Problem — Lifetime-Aware Cell Control
How can we manage individual battery cells to maximize usable energy, minimize degradation, and extend overall system lifetime?

## Key Technical Challenge — Digital Twin Uncertainty
How do we make reliable control decisions when aging predictions are uncertain and the digital twin differs from the real battery?

## Experimental Focus — Mixed-Age Cells, Same Chemistry (LFP)
A string mixing new cells (100% SoH) with second-life cells (70–90% SoH), with realistic cell-to-cell variation. Same chemistry, so differences come from aging, not material.

## Specific Application
A **1 MWh commercial BESS doing peak shaving / demand-charge reduction** for a commercial building in New England (ISO-NE region), built partly from second-life cells, or an existing system augmented with new cells.

## The Problem in One Sentence
In a conventional series string, **the weakest cell limits the whole string**: the pack stops charging and discharging when the worst cell hits its voltage limit, so the energy left in healthier cells is wasted and weak cells age fastest.

## Control Mechanism
Cell-level switching (bypass / duty-cycling each cell) lets the controller decide **how much each cell works**. The controller allocates load according to each cell's estimated state of health **and how uncertain that estimate is**. Weak cells are relieved, and strong cells are used fully.

## Strategies Compared (identical simulated conditions)
- **A. Conventional BMS:** series string with passive balancing; the weakest cell sets the limits.
- **B. Reactive cell switching:** bypass a cell only when it hits a voltage limit.
- **C. Predictive lifetime-aware (ours):** each control step chooses cell utilization to maximize delivered energy minus predicted degradation cost, with a risk-averse objective over an ensemble of degradation models.

## Uncertainty Handling
- **Ensemble digital twin:** N plausible degradation-parameter sets per cell, giving a prediction *distribution* rather than a single number.
- **Online Bayesian update:** the SoH estimate is corrected from measured voltage and capacity as the system runs.
- **Robust objective (CVaR):** decisions are optimized against bad-case outcomes, not just the average.
- **Mismatch stress test:** the "real" plant uses parameters deliberately different from the twin (0–30% error). We report where strategy C wins and where it stops winning.

## Value Quantified
**Technical:** lifetime MWh delivered, capacity fade at year N, years to end of life, safety-limit violations (target: 0).
**Economic:** demand-charge savings, deferred cell replacement, NPV ($/kWh installed), net of power-electronics losses and cost.
**Environmental:** avoided embodied CO₂e from deferred or avoided cell manufacturing, plus CO₂e avoided by reusing second-life cells instead of building new ones.

## New Opportunities Unlocked
- **Second-life EV cells without sorting or grading:** mixed-health cells are usable directly.
- **BESS augmentation:** add new cells to an aged system without the old cells dragging the new ones down.
- **Uncertainty-aware warranties:** lifetime predictions with confidence bounds give operators bankable numbers.

## Core Research Question
*Can uncertainty-aware, cell-level control deliver more usable energy, longer lifetime, and greater economic and environmental value than conventional and reactive strategies, and how robust is that advantage when the digital twin is wrong?*

## Project Goal
Show **when and how much** intelligent cell-level control creates measurable value for a real commercial storage application, including the conditions under which it does *not*.

---

# Solution Plan (Hackathon Build)

## 1. Simulator (physics-based, Python)
- **Electrical:** a 1RC Thevenin equivalent-circuit model per cell with an LFP OCV–SoC curve.
- **Degradation:** a semi-empirical LFP model in the form
  `Q_loss = B · exp(−Ea / RT) · (Ah_throughput)^z`
  (Wang et al., 2011, *J. Power Sources*, graphite/LiFePO₄; z ≈ 0.55, Ea ≈ 31.5 kJ/mol — values from memory, NOT yet verified against the paper, DOI 10.1016/j.jpowsour.2010.11.134; B depends on C-rate), plus a √t calendar-aging term.
- **Cell variation:** each cell gets randomized capacity, resistance, and aging parameters, drawn from different SoH distributions for new and second-life cells.
- **Scaling:** simulate one representative string (e.g. 16–100 cells) and scale results to 1 MWh. State the scaling clearly as an assumption.
- **Optional validation:** fit parameters to the NASA or CALCE public aging datasets, or cross-check against PyBaMM.

## 2. Load Profile and Prices
- Commercial building load with a peak-shaving dispatch (synthetic or an open building dataset).
- Demand-charge tariff typical of New England utilities. Label it as an assumption and keep it parameterized.

## 3. Controllers
- **A:** string limited by the min/max cell voltage.
- **B:** rule-based bypass at the voltage limits.
- **C:** receding-horizon optimizer that sets per-cell utilization weights. Cost = −energy + λ·CVaR(degradation over the ensemble). Use scipy or cvxpy, or a greedy heuristic if time is short.

## 4. Experiments
1. Vary the mix: % second-life cells (0 / 25 / 50 / 75%).
2. Vary the mismatch: twin error of 0 / 10 / 20 / 30%.
3. Report results with multiple random seeds and confidence intervals, not a single run.

## 5. Economics and Environment (all parameterized, sources cited)
- NPV over 10–15 years: savings + deferred replacement − extra electronics cost − switching losses (assume ~1–2%, labelled).
- Embodied emissions of LFP cell manufacturing: use a published range (roughly tens to ~100 kg CO₂e/kWh). Show a range, not a single number.

## 6. Demo
A Streamlit dashboard with sliders for the cell-age mix and twin uncertainty. Charts show capacity fade per strategy, lifetime MWh, $ NPV, and CO₂e avoided, with uncertainty bands.

## 7. Honest Reporting
If strategy C beats B only at a high second-life share or a low twin error, **say so**. "When it helps" is part of the stated research question.
