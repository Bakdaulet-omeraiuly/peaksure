# Problem 3 — Mixed-Age Cells (Same Chemistry) and Second-Life Use

## The problem
Mixing new and aged cells (second-life EV cells, or augmenting an old BESS with new cells) is cheap and green, but:
- Variation in SoH and resistance is large in used packs. In one used LFP HEV study, reuse was "infeasible as-is" for most packs. Acceptance was 90–99% of cells and 75–94% of modules, depending on the criteria (Ramirez-Meyers et al., 2023).
- Even in retired modules averaging ~95% SoH there is dispersion (σ ≈ 2.4%), and the authors call for balancing designed for second-life use (arXiv 2507.14020).
- In packs with mixed SoH, lower-SoH modules carry less current and sit at a different SoC because of their higher resistance (Mathematics, 2022).
- Today's industry answer is **sorting and grading**: testing and matching cells. It is slow and costly, and REON explicitly says its technology removes the need for it.

## What already exists
- Sorting and grading by capacity and resistance before repacking.
- Module-level mixed-pack control (e.g. US patent 11214171, "Mixed battery pack control").
- Pack-level models of heterogeneous SoH (Mathematics, 2022). These are simulations without a lifetime-optimal controller.

## Our solution
### Experimental design
- **Chemistry:** LFP, which dominates stationary storage. One chemistry keeps the comparison fair.
- **Cell populations:**
  - New: SoH ~ N(100%, 1%), resistance R₀ nominal.
  - Second-life: SoH ~ U(70%, 90%) plus a resistance increase correlated with fade. Justify the range from the studies above and label it an assumption.
- **Mix scenarios:** 0 / 25 / 50 / 75 / 100% second-life.
- **Augmentation scenario:** a pack aged 5 years plus 20% new cells.

### What cell-level control changes
- Strategy A: the pack is limited by the worst second-life cell, so sorting is mandatory.
- Strategies B and C: every cell contributes what it can, so **sorting becomes unnecessary**. This is an "unlock new opportunities" claim, and we quantify it.

### Key output
"**Usable energy vs % second-life**" curves for A/B/C. Expected shape: A falls steeply, while B and C stay flat longer. C also extends lifetime.

### Sorting cost avoided
Estimate the cost of test-and-grade labor and time per kWh as a parameter. Take a literature value if one can be found; otherwise label the range clearly as an assumption.

## How we prove it
- Same load and seeds across all mix scenarios.
- Sensitivity analysis: widen or narrow the SoH spread and show where the benefit is largest. Expected result: the wider the spread, the bigger C's advantage.

## Risks
- Second-life cells can have **faults**, not just low SoH. The field study found two faulty cells out of 324. A controller should detect them and bypass them permanently. Add a simple anomaly rule: voltage deviation > kσ leads to quarantine.
- Safety: aged LFP is relatively safe, but thermal limits must remain hard constraints.

## Sources
- [Second-life field data — arXiv 2609.04487](https://arxiv.org/pdf/2609.04487)
- [Retired battery cell-position capacity study — arXiv 2507.14020](https://arxiv.org/html/2507.14020v1)
- [Weakest cell in series — Atlantis Press](https://atlantis-press.com/article/126001370.pdf)
- [Second-life pack with heterogeneous SoH — Mathematics 2022](https://www.aminer.org/pub/634ec5e490e50fcafde1f14c/mathematical-modelling-and-simulation-of-second-life-battery-pack-with-heterogeneous-state)
- [Technical viability of second life — Loyola](https://www.uloyola.es/en/research-transfer/publications/technical-viability-of-battery-second-life-a-study-from-the-ageing-perspective-article)
- [Mixed battery pack control — US 11214171](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11214171)
- [REON technology](https://kelaenderkoe.pages.dev/float-https-reoncorp.com/technology)
