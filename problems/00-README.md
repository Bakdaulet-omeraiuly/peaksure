# REON CellLife AI — Problems and Solutions Index

| # | Problem | File | Solution in one line |
|---|---|---|---|
| 1 | Weakest cell limits the string | 01-weakest-cell-lifetime-control.md | Plan each cell's utilization to equalize time to end of life, not just SoC |
| 2 | Digital twin can be wrong | 02-digital-twin-uncertainty.md | Ensemble twin with Bayesian updates; test decisions under deliberate twin error |
| 3 | Mixed-age / second-life cells | 03-mixed-age-second-life-cells.md | Cell-level control replaces sorting; measure value vs % second-life |
| 4 | Economic value | 04-economic-value.md | NPV for peak-shaving BESS; degradation valued as lost revenue; break-even electronics cost |
| 5 | Environmental value | 05-environmental-value.md | Avoided new-cell manufacturing CO₂e, gCO₂e per delivered kWh, with uncertainty band |

## What is known vs what is new
**Known (we build on it, and cite it):**
- Bypassing weak cells extends life. Chalmers, *Nature Communications* 2026: >20% for EVs.
- Rainflow degradation cost is convex and works inside optimizers (Shi, Xu, Kirschen et al.).
- LFP manufacturing CO₂e is roughly 31–92 kg/kWh.

**New (our contribution, to our knowledge based on a limited search, not a full review):**
> **How much is cell-level intelligence worth when the twin is wrong?**
> A map of the advantage of strategy C over A and B across **(second-life share × twin error)**, plus the **$ value of better information** (per % of twin error reduced).

Why this matters to REON: it tells them **which customers** (how mixed their packs are) and **how much sensing and modelling** make their product pay off. That is a decision tool, not just a simulation.

## Rules for the claims we make
- Never say "first" or "novel" without "to our knowledge".
- Every number is either computed by us (with seeds and confidence intervals) or cited.
- Report the regions where our method does **not** win.
