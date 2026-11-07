# Problem 2 — Digital Twin Uncertainty

## The problem
Strategy C (Problem 1) decides based on **predicted** aging. But:
- SoH estimates are noisy. Lumped models miss limiting cells by up to 31% (arXiv 2609.04487).
- Degradation-model parameters vary cell to cell and are fit on lab data, not on this pack.
- **Model–plant mismatch** biases estimates even when the model is "correctly parameterized" (arXiv 2504.13324).

If the twin is wrong, an "optimal" controller can be **worse** than a simple one. For example, it may overwork a cell it wrongly believes is healthy.

## What already exists
| Approach | Source | Gap for us |
|---|---|---|
| Bayesian NN ensembles for capacity prognostics | Alcibar et al., PHM 2024 / NeurIPS workshop (arXiv 2405.15292) | Prediction only; no control decisions |
| Five-tier digital twin with UQ layer, SoH error <3% | arXiv 2509.02366 | Describes a prescriptive tier but no robust control evaluation |
| Reference-voltage SoH estimation to cancel model mismatch | arXiv 2504.13324 | Estimation, not control |
| Deliberate mismatch for robustness: underestimating available energy makes the controller more robust | Sandia/UT Austin, OSTI 1592238 | Pack-level grid storage, not cell-level |
| CVaR in BESS bidding | Iberian market study, 2024 | **Found CVaR performed *worse* than deterministic forecasts.** Robustness is not free |

Gap (based on our search, not a full review): we found **no work that measures how cell-level control performance degrades as twin error grows, and where it stops paying off.** This is our scientific contribution (see 00-README).

## Our solution
### 1. Represent uncertainty explicitly
- For each cell, keep an **ensemble of K parameter sets** (K≈20–50) for capacity, resistance, and aging coefficients, sampled from a prior (wider for second-life cells).
- **Online Bayesian update:** compare measured capacity and voltage with each ensemble member's prediction and reweight the members (a particle-filter-style update). Uncertainty **shrinks as data arrives**.

### 2. Decide under uncertainty, choosing among three options
1. **Certainty-equivalent:** use the ensemble mean. Simple, and it is the baseline.
2. **Robust (CVaR_α):** penalize the worst α% of predicted outcomes.
3. **Conservative margin:** derate uncertain cells by k·σ. This follows the Sandia finding that underestimating is safer.

We test all three. The Iberian result warns that robust is not automatically better, so **we report whichever wins honestly**.

### 3. Mismatch stress test (core experiment)
- The "real" plant uses true parameters. The twin is given parameters with error ε ∈ {0, 10, 20, 30%}: random noise **and** systematic bias.
- Run strategies A, B, and C at each ε.
- Output: a **"value vs twin error" curve**, showing where C's advantage over B disappears.

### 4. Value of information (the novel part)
From the curve: **$ gained per % reduction in twin error.** This tells REON how much better sensing or diagnostics (e.g. periodic capacity tests) is worth. Optional extension: the controller occasionally runs a diagnostic cycle on its most uncertain cell when the expected value of the information exceeds the cost (a dual-control idea).

## How we prove it
- Several random seeds per scenario, reported with confidence intervals.
- Calibration check: the true SoH should fall inside the ensemble's 90% interval about 90% of the time.
- A comparison of "C with perfect twin" vs "C with ε twin" isolates the cost of uncertainty.

## Risks
- Ensemble × cells × horizon gets expensive to compute. Keep the number of cells small (16–100), scale up, and state that we scaled.
- Choosing the prior arbitrarily: justify the SoH spread for second-life cells from the literature (Problem 3).

## Sources
- [Probabilistic fusion for battery prognostics — arXiv 2405.15292](https://arxiv.org/pdf/2405.15292), [NeurIPS 2024 workshop](https://nips.cc/virtual/2024/98932)
- [Five-tier battery digital twin — arXiv 2509.02366](https://arxiv.org/pdf/2509.02366)
- [Robust SoH via reference voltage — arXiv 2504.13324](https://arxiv.org/pdf/2504.13324)
- [Grid storage controller robustness via mismatch — OSTI 1592238](https://www.osti.gov/servlets/purl/1592238)
- [Parameter mismatch and SoC error — U. Michigan](https://public.websites.umich.edu/~annastef/papers/393_1.pdf)
- [CVaR in BESS arbitrage — UC3M](https://researchportal.uc3m.es/display/act564608)
